// html2canvas cannot reproduce several of the layout primitives used by the
// ACDL renderer. Before a capture we swap them for equivalents it does handle,
// and restore the DOM afterwards. Keep this in sync with the same workarounds
// in src/index.html (web export) and src/render-to-png.ts (batch export).
(function () {
  "use strict";

  // html2canvas drops the text of inline-flex elements in some nesting
  // contexts (e.g. a bare template-block that is not wrapped in a
  // block-with-comment). inline-block renders identically here.
  var INLINE_FLEX_SELECTOR =
    ".context-var, .template-block, .func-block, .expr-context-var," +
    " .frag-invocation";

  function saveStyle(el) {
    return { el: el, css: el.style.cssText };
  }

  function restoreStyles(saved) {
    for (var i = 0; i < saved.length; i++) {
      saved[i].el.style.cssText = saved[i].css;
    }
  }

  /**
   * Prepare `root` for an html2canvas capture.
   * Returns a function that undoes every change.
   */
  window.acdlPrepareCapture = function (root) {
    var saved = [];
    var savedClasses = [];
    var each = function (selector, fn) {
      var els = root.querySelectorAll(selector);
      for (var i = 0; i < els.length; i++) {
        saved.push(saveStyle(els[i]));
        fn(els[i]);
      }
      return els;
    };

    each(INLINE_FLEX_SELECTOR, function (el) {
      el.style.display = "inline-block";
    });

    // Mark blocks position their bracket absolutely; html2canvas mislays it.
    each(".mark-block", function (el) {
      el.style.display = "flex";
      el.style.alignItems = "stretch";
      el.style.paddingRight = "0";
    });
    each(".mark-block-bracket", function (el) {
      el.style.position = "relative";
      el.style.right = "auto";
      el.style.top = "auto";
      el.style.bottom = "auto";
      el.style.marginLeft = "8px";
    });
    each(".mark-block-content", function (el) {
      el.style.flex = "1";
    });

    // html2canvas does not resolve CSS custom properties.
    each(".time-index, .other-index", function (el) {
      el.style.display = "inline";
      el.style.color = "#0969da";
      el.style.fontWeight = "700";
      el.style.fontFamily = "'JetBrains Mono', 'SF Mono', monospace";
    });

    // repeating-linear-gradient is not supported; draw a dashed border.
    each(".end-dashed-line", function (el) {
      el.style.background = "none";
      el.style.height = "0";
      el.style.borderBottom = "1px dashed #6e7781";
      el.style.alignSelf = "center";
    });

    // Titles must not wrap in the exported image.
    each(".prompt-title h1, .frag-def-title h1", function (el) {
      el.style.whiteSpace = "nowrap";
    });

    // With inline-block the ::before diamond loses its flex alignment.
    var fixStyle = document.createElement("style");
    fixStyle.textContent =
      ".template-block::before, .func-block::before {" +
      " vertical-align: middle; line-height: 1;" +
      " position: relative; top: -1px;" +
      // inline-block ignores the parent's `gap`, so restore it by hand.
      " margin-right: 2px; }";
    document.head.appendChild(fixStyle);

    // Comments are laid out by flex; once their parents are inline-block we
    // have to give them an explicit wrapping width so they keep the same
    // shape as the live preview.
    var rootWidth = root.getBoundingClientRect().width;
    var blocks = root.querySelectorAll(".block-with-comment");
    for (var i = 0; i < blocks.length; i++) {
      var block = blocks[i];
      var main = block.firstElementChild;
      var comment = block.querySelector(".inline-comment, .comment");
      savedClasses.push({
        el: block,
        wrapped: block.classList.contains("comment-wrapped"),
      });
      if (!main || !comment) continue;
      saved.push(saveStyle(comment));
      var mainWidth = main.getBoundingClientRect().width;
      // Overhead = container padding-left + border-left (10 + 1)
      //          + role-body-block padding-x (2 * 6)
      //          + block-with-comment gap (4) = 27px.
      // 350px is the max-width CSS already gives .comment / .inline-comment.
      var available = rootWidth - 27 - mainWidth;
      comment.style.maxWidth = Math.max(80, Math.min(available, 350)) + "px";
      comment.style.minWidth = "0";
      comment.style.flex = "0 1 auto";
      comment.style.whiteSpace = "normal";
      comment.style.overflowWrap = "break-word";
    }

    // Force layout, then mark comments that ended up on more than one line so
    // they align to the top of their row.
    void document.body.offsetHeight;
    for (var j = 0; j < blocks.length; j++) {
      var b = blocks[j];
      var c = b.querySelector(".inline-comment, .comment");
      if (!c) continue;
      var lineHeight = parseFloat(getComputedStyle(c).lineHeight) || 16;
      if (c.offsetHeight > lineHeight * 1.5) b.classList.add("comment-wrapped");
      else b.classList.remove("comment-wrapped");
    }

    return function restore() {
      restoreStyles(saved);
      for (var k = 0; k < savedClasses.length; k++) {
        var s = savedClasses[k];
        if (s.wrapped) s.el.classList.add("comment-wrapped");
        else s.el.classList.remove("comment-wrapped");
      }
      fixStyle.remove();
    };
  };
})();
