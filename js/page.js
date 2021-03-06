/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

// The amount of time we wait while coalescing updates for hidden pages.
const SCHEDULE_UPDATE_TIMEOUT_MS = 1000;

/**
 * This singleton represents the whole 'New Tab Page' and takes care of
 * initializing all its components.
 */
let gPage = {
  /**
   * The page's unique window ID.
   */
  get windowID() {
    delete this.windowID;
    return 0;//this.windowID = window.QueryInterface(Ci.nsIInterfaceRequestor)
             //                    .getInterface(Ci.nsIDOMWindowUtils)
             //                      .outerWindowID;
  },

  /**
   * Initializes the page.
   */
  init: function Page_init() {
    gNewTab.registerListener("NewTab:UpdatePages", this.update.bind(this));
    gNewTab.registerListener("NewTab:PinState", this.setPinState.bind(this));
    gNewTab.registerListener("NewTab:BlockState", this.setBlockState.bind(this));

    // Listen for 'unload' to unregister this page.
    addEventListener("unload", this, false);

    // XXX bug 991111 - Not all click events are correctly triggered when
    // listening from xhtml nodes -- in particular middle clicks on sites, so
    // listen from the xul window and filter then delegate
    addEventListener("click", this, false);

    addEventListener("unload", this, false);

    // Check if the new tab feature is enabled.
    if (gNewTab.enabled)
      this._init();

    this._updateAttributes(gNewTab.enabled);

    // Initialize customize controls.
    gCustomize.init();

    // Initialize intro panel.
    //gIntro.init();
  },

  /**
   * Updates the page's grid right away for visible pages. If the page is
   * currently hidden, i.e. in a background tab or in the preloader, then we
   * batch multiple update requests and refresh the grid once after a short
   * delay. Accepts a single parameter the specifies the reason for requesting
   * a page update. The page may decide to delay or prevent a requested updated
   * based on the given reason.
   */
  update(message) {
    if (message == null) {
      return;
    }

    let currentWindowID = this.windowID;
    currentWindowID = message.outerWindowID;

    // Do not refresh the entire grid for the page we're on, as refreshing will
    // cause tiles to flash briefly. It is ok to refresh pages not currently visible
    // but ignore updates for the currently visible page.
    if (currentWindowID == message.outerWindowID || message.refresh == false) {
      // We do, however, want to update the grid if the tiles have changed location
      // due to unpinning, blocking or restoring.
      gUpdater.updateGrid(message);
      return;
    }
    // Update immediately if we're visible.
    if (!document.hidden) {
      if (gGrid.ready) {
        gGrid.refresh(message);
      }
      return;
    }

    // Bail out if we scheduled before.
    if (this._scheduleUpdateTimeout) {
      return;
    }

    this._scheduleUpdateTimeout = setTimeout(() => {
      // Refresh if the grid is ready.
      if (gGrid.ready) {
        gGrid.refresh(message);
      }

      this._scheduleUpdateTimeout = null;
    }, SCHEDULE_UPDATE_TIMEOUT_MS);
  },

  /**
   * Internally initializes the page. This runs only when/if the feature
   * is/gets enabled.
   */
  _init: function Page_init() {
    if (this._initialized)
      return;

    this._initialized = true;

    // Initialize search.
    //gSearch.init();

    if (document.hidden) {
      addEventListener("visibilitychange", this);
    } else {
      setTimeout(_ => this.onPageFirstVisible());
    }

    // Initialize and render the grid.
    gGrid.init();

    // Initialize the drop target shim.
    gDropTargetShim.init();

    if (navigator.platform.indexOf("Mac") !== -1) {
      // Workaround to prevent a delay on MacOSX due to a slow drop animation.
      document.addEventListener("dragover", this, false);
      document.addEventListener("drop", this, false);
    }
  },

  /**
   * Updates the 'page-disabled' attributes of the respective DOM nodes.
   * @param aValue Whether the New Tab Page is enabled or not.
   */
  _updateAttributes: function Page_updateAttributes(aValue) {
    // Set the nodes' states.
    let nodeSelector = "#newtab-grid, #newtab-search-container";
    for (let node of document.querySelectorAll(nodeSelector)) {
      if (aValue)
        node.removeAttribute("page-disabled");
      else
        node.setAttribute("page-disabled", "true");
    }

    // Enables/disables the control and link elements.
    let inputSelector = ".newtab-control, .newtab-link";
    for (let input of document.querySelectorAll(inputSelector)) {
      if (aValue)
        input.removeAttribute("tabindex");
      else
        input.setAttribute("tabindex", "-1");
    }
  },

  /**
   * Handles unload event
   */
  _handleUnloadEvent: function Page_handleUnloadEvent() {
    // compute page life-span and send telemetry probe: using milli-seconds will leave
    // many low buckets empty. Instead we use half-second precision to make low end
    // of histogram linear and not loose the change in user attention
    let delta = Math.round((Date.now() - this._firstVisibleTime) / 500);
    if (this._suggestedTilePresent) {
      gNewTab.sendToBrowser("NewTab:UpdateTelemetryProbe", {probe: "NEWTAB_PAGE_LIFE_SPAN_SUGGESTED", value: delta});
    }
    else {
      gNewTab.sendToBrowser("NewTab:UpdateTelemetryProbe", {probe: "NEWTAB_PAGE_LIFE_SPAN", value: delta});
    }
  },

  /**
   * Handles all page events.
   */
  handleEvent: function Page_handleEvent(aEvent) {
    switch (aEvent.type) {
      case "load":
        this.onPageVisibleAndLoaded();
        break;
      case "unload":
        this._handleUnloadEvent();
        break;
      case "click":
        let {button, target} = aEvent;
        // Go up ancestors until we find a Site or not
        while (target) {
          if (target.hasOwnProperty("_newtabSite")) {
            target._newtabSite.onClick(aEvent);
            break;
          }
          target = target.parentNode;
        }
        break;
      case "dragover":
        if (gDrag.isValid(aEvent) && gDrag.draggedSite)
          aEvent.preventDefault();
        break;
      case "drop":
        if (gDrag.isValid(aEvent) && gDrag.draggedSite) {
          aEvent.preventDefault();
          aEvent.stopPropagation();
        }
        break;
      case "visibilitychange":
        // Cancel any delayed updates for hidden pages now that we're visible.
        if (this._scheduleUpdateTimeout) {
          clearTimeout(this._scheduleUpdateTimeout);
          this._scheduleUpdateTimeout = null;

          // An update was pending so force an update now.
          this.update();
        }

        setTimeout(() => this.onPageFirstVisible());
        removeEventListener("visibilitychange", this);
        break;
    }
  },

  onPageFirstVisible: function () {
    // Record another page impression.
    gNewTab.sendToBrowser("NewTab:UpdateTelemetryProbe", {probe: "NEWTAB_PAGE_SHOWN", value: true});

    for (let site of gGrid.sites) {
      if (site) {
        // The site may need to modify and/or re-render itself if
        // something changed after newtab was created by preloader.
        // For example, the suggested tile endTime may have passed.
        site.onFirstVisible();
      }
    }

    // save timestamp to compute page life-span delta
    this._firstVisibleTime = Date.now();

    if (document.readyState == "complete") {
      this.onPageVisibleAndLoaded();
    } else {
      addEventListener("load", this);
    }
  },

  onPageVisibleAndLoaded() {
    // Send the index of the last visible tile.
    this.reportLastVisibleTileIndex();

    // Show the panel now that anchors are sized
    //gIntro.showIfNecessary();
  },

  reportLastVisibleTileIndex() {
    let cells = document.getElementsByClassName("newtab-cell");
    let lastIndex = cells.length - 1;
    for (let site of gGrid.sites) {
      if (site && site.link.targetedSite) {
        this._suggestedTilePresent = true;
      }
    }
    gNewTab.sendToBrowser("NewTab:ReportSitesAction", {sites: gNewTab.stringifySites(gGrid.sites), action: "view", index: lastIndex});
  },

  setPinState: function Page_setPinState(message) {
    for (let site of gGrid.sites) {
      if (site && site._link.url == message.link.url) {
        site._link.pinState = message.pinState;
      }
    }
  },

  setBlockState: function Page_setBlockState(message) {
    for (let site of gGrid.sites) {
      if (site && site._link.url == message.link.url) {
        site._link.blockState = message.blockState;
      }
    }
  },
};
