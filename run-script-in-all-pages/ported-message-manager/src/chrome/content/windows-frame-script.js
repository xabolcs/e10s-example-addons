/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

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
  var responses = sendSyncMessage("request-window-id");
  var outerWindowID = responses[0];
  dump('got outer id: ' + outerWindowID + '\n');
  return outerWindowID;
}

utils.sleep = function () {}

/**
 * A compatibility shim for window.js
 */
var map = {}

map.update = function (aWindowId, aProperty, aValue) {
  dump("*** windowId updated: property=" + aProperty + ", value=" + aValue + "\n");
}

map.updatePageLoadStatus = function (aId, aIsLoaded) {
  dump("*** Page status updated: id=" + aId + ", loaded=" + aIsLoaded + "\n");
}

/**
 * Attach event listeners
 *
 * @param {ChromeWindow} aWindow
 *        Window to attach listeners on.
 */
function attachEventListeners(aWindow) {
  // These are the event handlers
  var pageShowHandler = function (aEvent) {
    var doc = aEvent.originalTarget;

    // Only update the flag if we have a document as target
    // see https://bugzilla.mozilla.org/show_bug.cgi?id=690829
    if ("defaultView" in doc) {
      var id = utils.getWindowId(doc.defaultView);
      dump("*** 'pageshow' event: id=" + id + ", baseURI=" + doc.baseURI + "\n");
      map.updatePageLoadStatus(id, true);
    }

    // We need to add/remove the unload/pagehide event listeners to preserve caching.
    aWindow.addEventListener("beforeunload", beforeUnloadHandler, true);
    aWindow.addEventListener("pagehide", pageHideHandler, true);
  };

  var DOMContentLoadedHandler = function (aEvent) {
    var doc = aEvent.originalTarget;

    // Only update the flag if we have a document as target
    if ("defaultView" in doc) {
      var id = utils.getWindowId(doc.defaultView);
      dump("*** 'DOMContentLoaded' event: id=" + id + ", baseURI=" + doc.baseURI + "\n");

      // We only care about error pages for DOMContentLoaded
      var errorRegex = /about:.+(error)|(blocked)\?/;
      if (errorRegex.exec(doc.baseURI)) {
        // Wait about 1s to be sure the DOM is ready
        utils.sleep(1000);

        map.updatePageLoadStatus(id, true);
      }

      // We need to add/remove the unload event listener to preserve caching.
      aWindow.addEventListener("beforeunload", beforeUnloadHandler, true);
    }
  };

  // beforeunload is still needed because pagehide doesn't fire before the page is unloaded.
  // still use pagehide for cases when beforeunload doesn't get fired
  var beforeUnloadHandler = function (aEvent) {
    var doc = aEvent.originalTarget;

    // Only update the flag if we have a document as target
    if ("defaultView" in doc) {
      var id = utils.getWindowId(doc.defaultView);
      dump("*** 'beforeunload' event: id=" + id + ", baseURI=" + doc.baseURI + "\n");
      map.updatePageLoadStatus(id, false);
    }

    aWindow.removeEventListener("beforeunload", beforeUnloadHandler, true);
  };

  var pageHideHandler = function (aEvent) {
    var doc = aEvent.originalTarget;

    // Only update the flag if we have a document as target
    if ("defaultView" in doc) {
      var id = utils.getWindowId(doc.defaultView);
      dump("*** 'pagehide' event: id=" + id + ", baseURI=" + doc.baseURI + "\n");
      map.updatePageLoadStatus(id, false);
    }
    // If event.persisted is true the beforeUnloadHandler would never fire
    // and we have to remove the event handler here to avoid memory leaks.
    if (aEvent.persisted)
      aWindow.removeEventListener("beforeunload", beforeUnloadHandler, true);
  };

  var onWindowLoaded = function (aEvent) {
    var id = utils.getWindowId(aWindow);
    dump("*** 'load' event: id=" + id + ", baseURI=" + aWindow.document.baseURI + "\n");

    map.update(id, "loaded", true);

    // Note: Error pages will never fire a "pageshow" event. For those we
    // have to wait for the "DOMContentLoaded" event. That's the final state.
    // Error pages will always have a baseURI starting with
    // "about:" followed by "error" or "blocked".
    aWindow.addEventListener("DOMContentLoaded", DOMContentLoadedHandler, true);

    // Page is ready
    aWindow.addEventListener("pageshow", pageShowHandler, true);

    // Leave page (use caching)
    aWindow.addEventListener("pagehide", pageHideHandler, true);
  };

  // If the window has already been finished loading, call the load handler
  // directly. Otherwise attach it to the current window.
  if (aWindow.document.readyState === 'complete') {
    onWindowLoaded();
  } else {
    aWindow.addEventListener("load", onWindowLoaded, false);
  }
}

attachEventListeners(content);

dump("windows frame script readystate=" + content.document.readyState + "\n");
