/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

var {interfaces: Ci} = Components;
var contentIfaceReq = content.QueryInterface(Ci.nsIInterfaceRequestor);
var domUtils = contentIfaceReq.getInterface(Ci.nsIDOMWindowUtils);

/**
 * A compatibility shim for windows.js
 */
var utils = {};

/**
 * Retrieve the outer window id for the given window.
 *
 * @param {Number} aWindow
 *        Window to retrieve the id from.
 * @returns {Boolean} The outer window id
 **/
utils.getWindowId = function getWindowId(aWindow) {
  var outerWindowId = domUtils.outerWindowID;
  dumpn('outer id: ' + outerWindowId);
  return outerWindowId;
}

utils.sleep = function () {}

/**
 * A compatibility shim for window.js
 */
var map = {}

map.update = function (aWindowId, aProperty, aValue) {
  sendAsyncMessage("mozmill:do-map-update", {
      windowId: aWindowId,
      property: aProperty,
      value: aValue
    }
  );
  dumpn("*** windowId updated: " + aWindowId + ", property=" + aProperty + ", value=" + aValue);
}

map.updatePageLoadStatus = function (aId, aIsLoaded) {
  sendAsyncMessage("mozmill:do-map-update-page-load-status", {
      windowId: aId,
      loaded: aIsLoaded
    }
  );
  dumpn("*** Page status updated: id=" + aId + ", loaded=" + aIsLoaded);
}


// These are the event handlers
var pageShowHandler = function (aEvent) {
  var doc = aEvent.originalTarget;

  // Only update the flag if we have a document as target
  // see https://bugzilla.mozilla.org/show_bug.cgi?id=690829
  if ("defaultView" in doc) {
    var id = utils.getWindowId(doc.defaultView);
    dumpn("*** 'pageshow' event: id=" + id + ", baseURI=" + doc.baseURI);
    map.updatePageLoadStatus(id, true);
  }

  // We need to add/remove the unload/pagehide event listeners to preserve caching.
  addEventListener("beforeunload", beforeUnloadHandler, true);
  addEventListener("pagehide", pageHideHandler, true);
};

var DOMContentLoadedHandler = function (aEvent) {
  var doc = aEvent.originalTarget;

  // Only update the flag if we have a document as target
  if ("defaultView" in doc) {
    var id = utils.getWindowId(doc.defaultView);
    dumpn("*** 'DOMContentLoaded' event: id=" + id + ", baseURI=" + doc.baseURI);

    // We only care about error pages for DOMContentLoaded
    var errorRegex = /about:.+(error)|(blocked)\?/;
    if (errorRegex.exec(doc.baseURI)) {
      // Wait about 1s to be sure the DOM is ready
      utils.sleep(1000);

      map.updatePageLoadStatus(id, true);
    }

    // We need to add/remove the unload event listener to preserve caching.
    addEventListener("beforeunload", beforeUnloadHandler, true);
  }
};

// beforeunload is still needed because pagehide doesn't fire before the page is unloaded.
// still use pagehide for cases when beforeunload doesn't get fired
var beforeUnloadHandler = function (aEvent) {
  var doc = aEvent.originalTarget;

  // Only update the flag if we have a document as target
  if ("defaultView" in doc) {
    var id = utils.getWindowId(doc.defaultView);
    dumpn("*** 'beforeunload' event: id=" + id + ", baseURI=" + doc.baseURI);
    map.updatePageLoadStatus(id, false);
  }

  removeEventListener("beforeunload", beforeUnloadHandler, true);
};

var pageHideHandler = function (aEvent) {
  var doc = aEvent.originalTarget;

  // Only update the flag if we have a document as target
  if ("defaultView" in doc) {
    var id = utils.getWindowId(doc.defaultView);
    dumpn("*** 'pagehide' event: id=" + id + ", baseURI=" + doc.baseURI);
    map.updatePageLoadStatus(id, false);
  }
  // If event.persisted is true the beforeUnloadHandler would never fire
  // and we have to remove the event handler here to avoid memory leaks.
  if (aEvent.persisted)
    removeEventListener("beforeunload", beforeUnloadHandler, true);
};

function dumpn(aMsg) {
  dump("[windows-frame-script.js] " + aMsg + "\n");
}

var onWindowLoaded = function (aEvent) {
  var id = utils.getWindowId(content);
  dumpn("*** 'load' event: id=" + id + ", baseURI=" + content.document.baseURI);

  map.update(id, "loaded", true);

  // Note: Error pages will never fire a "pageshow" event. For those we
  // have to wait for the "DOMContentLoaded" event. That's the final state.
  // Error pages will always have a baseURI starting with
  // "about:" followed by "error" or "blocked".
  addEventListener("DOMContentLoaded", DOMContentLoadedHandler, true);

  // Page is ready
  addEventListener("pageshow", pageShowHandler, true);

  // Leave page (use caching)
  addEventListener("pagehide", pageHideHandler, true);
};

onWindowLoaded();
