(function () {
  const DEBUG = localStorage.DEBUG === 'true'; // Can override by setting localStorage.DEBUG = true

  const debugLog = (...args) => {
    if (DEBUG) console.log(...args);
  };

  const debugError = (...args) => {
    if (DEBUG) console.error(...args);
  };

  document.addEventListener('DOMContentLoaded', function () {
    const pswpElement = document.querySelector('.pswp');
    if (!pswpElement) return;

    let caption = null;
    let albumImages = null;
    let photoswipeInstance = null;

    function findSmugMugNodeId() {
      const walker = document.createTreeWalker(
        document.body,
        NodeFilter.SHOW_TEXT,
        {
          acceptNode(node) {
            return node.nodeValue.trim().length >= 6
              ? NodeFilter.FILTER_ACCEPT
              : NodeFilter.FILTER_SKIP;
          }
        }
      );

      let lastMatch = null;

      while (walker.nextNode()) {
        const text = walker.currentNode.nodeValue.trim();
        const matches = text.match(/[a-zA-Z0-9]{6}/g);
        if (matches && matches.length) {
          lastMatch = matches[matches.length - 1];
        }
      }

      return lastMatch;
    }

    const smNodeId = findSmugMugNodeId();
    debugLog('Last 6-char string near </body>:', smNodeId);

    function createCaptionElement() {
      if (caption) return caption;

      caption = document.createElement('div');
      caption.className = 'pswp__custom-caption';
      caption.style.cssText = `
        position: absolute;
        bottom: 20px;
        left: 0;
        width: 100%;
        text-align: center;
        color: white;
        font-size: 14px;
        text-shadow: 0 0 5px black;
        z-index: 1500;
        padding: 10px;
        background-color: rgba(0, 0, 0, 0.5);
        pointer-events: none;
        display: none;
      `;

      const uiElement = pswpElement.querySelector('.pswp__ui') || pswpElement;
      uiElement.appendChild(caption);

      return caption;
    }

    function extractSmugMugKey(src) {
      const match = src.match(/\/i-([^\/]+)\//);
      return match ? match[1] : null;
    }

    async function fetchAlbumFromNode(nodeId) {
      try {
        const response = await fetch(`/api/node/${nodeId}/albumId`);
        if (!response.ok) return null;
        const data = await response.json();
        debugLog("response???");
        debugLog(data);
        return data || null;
      } catch (error) {
        debugError("Error fetching Node Album Data:", error);
        return null;
      }
    }

    async function fetchAlbumImages(albumKey) {
      try {
        const response = await fetch(`/api/album/${albumKey}/images`);
        if (!response.ok) return null;
        const data = await response.json();
        return data.images;
      } catch (error) {
        debugError("Error fetching Node Album Data:", error);
        return null;
      }
    }

    function formatCaption(text) {
      if (!text) return '';
      const normalized = text.replace(/\n+/g, '\n');
      const lines = normalized.split('\n');
      debugLog(`line count ${lines.length}`);
      const truncated = lines.length > 2 ? lines.slice(0, 2).join('\n') : normalized;
      return truncated;
    }

    function displayCaption(captionEl, text) {
      if (!captionEl) return;

      if (text === "No caption found" || text === "") {
        captionEl.style.display = 'none';
        debugLog("Hiding caption - no content");
      } else {
        captionEl.innerText = text;
        captionEl.style.display = 'block';
        captionEl.style.opacity = '1';
        debugLog("Showing caption:", text);
      }
    }

    async function preloadAllCaptionsOnPage() {
      debugLog("Preloading captions for all images on page");
      const nodeId = findSmugMugNodeId();
      const album = await fetchAlbumFromNode(nodeId);
      if (album && album.albumId) {
        debugLog("Got album info: ", album.albumId);
        albumImages = await fetchAlbumImages(album.albumId);
        debugLog("Album images loaded:", albumImages ? "Yes" : "No");
      }
      debugLog("Page caption preloading complete");
    }

    function getActivePswpItem() {
      const container = document.querySelector('.pswp__container');
      const items = document.querySelectorAll('.pswp__item');

      const containerX = parseFloat(container.style.transform.match(/translate3d\((-?\d+)px/)[1]);

      let activeItem = null;
      let minDiff = Infinity;

      items.forEach(item => {
        const itemX = parseFloat(item.style.transform.match(/translate3d\((-?\d+)px/)[1]);
        const diff = Math.abs(containerX + itemX);

        if (diff < minDiff) {
          minDiff = diff;
          activeItem = item;
        }
      });

      return activeItem;
    }

    function updateCaption() {
      const captionEl = createCaptionElement();
      debugLog('firing updateCaption');
      const activeImg = getActivePswpItem()?.querySelector('img.pswp__img');
      debugLog("active image: ", activeImg);

      if (!activeImg) {
        debugLog("No active image found");
        return;
      }

      const imageKey = extractSmugMugKey(activeImg.src);
      debugLog("Image key:", imageKey);

      if (!imageKey) {
        debugLog("No image key found");
        return;
      }

      if (albumImages && imageKey in albumImages) {
        debugLog("Found imageKey", imageKey);
        debugLog("albumImages", albumImages);
        let captionText = formatCaption(albumImages[imageKey]);
        displayCaption(captionEl, captionText);
        return;
      }

      debugLog("Falling back to traditional caption method");
      let captionText = "No caption found";

      const originalImg = Array.from(document.querySelectorAll('img')).find(img => {
        return img.src.includes(imageKey);
      });

      if (originalImg) {
        const figure = originalImg.closest('figure');
        if (figure) {
          const figcaption = figure.querySelector('figcaption');
          captionText = figcaption ? figcaption.innerText : (originalImg.alt || captionText);
        } else {
          captionText = originalImg.alt || captionText;
        }
      }

      displayCaption(captionEl, captionText);
    }

    preloadAllCaptionsOnPage();

    const originalPhotoSwipe = window.PhotoSwipe;
    if (originalPhotoSwipe) {
      window.PhotoSwipe = function (element, uiClass, items, options) {
        photoswipeInstance = new originalPhotoSwipe(element, uiClass, items, options);
        createCaptionElement();

        photoswipeInstance.listen('afterChange', function () {
          debugLog("Gallery navigation detected, updating caption");
          updateCaption();
        });

        return photoswipeInstance;
      };

      window.PhotoSwipe.prototype = originalPhotoSwipe.prototype;
      Object.setPrototypeOf(window.PhotoSwipe, originalPhotoSwipe);
    }

    document.addEventListener('click', function (e) {
      setTimeout(function () {
        if (pswpElement.classList.contains('pswp--open') ||
          pswpElement.classList.contains('pswp--animated-in')) {
          debugLog("monkey patch times");
          updateCaption();
        }
      }, 500);
    });
  });
})();
