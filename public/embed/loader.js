/*
 * CozyCopilot embed loader
 * ------------------------
 *
 * A tiny (~3 KB) third-party script that hosts inject into their page
 * to embed the CozyCopilot widget. Plain ES5+ on purpose — no
 * `let` / `const` / arrow functions / optional chaining — because some
 * legacy CMSs (WordPress plugins, Squarespace, etc.) ship older
 * parsers. No external dependencies.
 *
 * Embed contract:
 *
 *   <script
 *     src="https://cdn.cozycopilot.com/embed/loader.js"
 *     data-key="ck_abc123"
 *     data-personality="00000000-0000-0000-0000-000000000001"
 *     data-theme="cozy-orange"
 *     data-hide-history="1"
 *   ></script>
 *
 * After the script runs, `window.CozyCopilot` is available:
 *
 *   window.CozyCopilot.open();        // expand the bubble
 *   window.CozyCopilot.close();       // collapse the panel
 *   window.CozyCopilot.on('cozy:ready', (msg) => { /* ... *\/ });
 *   window.CozyCopilot.send({ type: 'host:prefill', content: 'Hi!' });
 *
 * Wire-format events:
 *   - Widget → host (relayed):  cozy:ready, cozy:session_started,
 *                              cozy:tool_call, cozy:tool_result,
 *                              cozy:voice_started, cozy:voice_ended,
 *                              cozy:error
 *   - Host   → widget (posted): host:open, host:close, host:prefill,
 *                              host:clear, host:set_personality
 *
 * Security:
 *   - postMessage FROM the iframe is filtered by `evt.source ===
 *     iframe.contentWindow` (no wildcard on inbound).
 *   - postMessage TO the iframe uses `targetOrigin: '*'` in v1 (a
 *     documented limitation — future versions will use the parent's
 *     origin, which the widget advertises in `?parentOrigin=...`).
 */

(function () {
  // 1. Find our <script> tag and read its data- attributes. By the time
  //    this IIFE runs the DOM has the <script> element the host just
  //    appended, so `scripts[scripts.length - 1]` is always us.
  var scripts = document.getElementsByTagName('script');
  var me = scripts[scripts.length - 1];
  var data = {};
  for (var i = 0; i < me.attributes.length; i++) {
    var attr = me.attributes[i];
    if (attr.name.indexOf('data-') === 0) {
      data[attr.name.slice(5)] = attr.value;
    }
  }

  // 2. Build the iframe URL with the data- attrs as query string. The
  //    CDN base is derived from `me.src` by stripping `/loader.js`
  //    plus any query string the host used to pin a widget version.
  var baseUrl = me.src.replace(/\/loader\.js.*$/, '');
  var keys = Object.keys(data);
  var params = [];
  for (var j = 0; j < keys.length; j++) {
    var k = keys[j];
    params.push(encodeURIComponent(k) + '=' + encodeURIComponent(data[k]));
  }
  var iframeUrl = baseUrl + '/widget/?' + params.join('&');

  // 3. Create the iframe. Hidden until the widget sends `cozy:ready`,
  //    then it expands itself via its own internal state.
  var iframe = document.createElement('iframe');
  iframe.src = iframeUrl;
  iframe.style.cssText = 'position:fixed;bottom:0;right:0;width:0;height:0;border:0;';
  iframe.allow = 'microphone';
  iframe.title = 'CozyCopilot';
  document.body.appendChild(iframe);

  // 4. postMessage relay: iframe → host. Filter by `evt.source` so we
  //    don't accept messages from any other frame on the page.
  var handlers = {};
  window.addEventListener('message', function (evt) {
    if (evt.source !== iframe.contentWindow) return;
    var msg = evt.data;
    if (!msg || typeof msg !== 'object' || !msg.type) return;
    var list = handlers[msg.type] || [];
    for (var k2 = 0; k2 < list.length; k2++) {
      try { list[k2](msg); } catch (e) { /* swallow — host handler errors must not break the relay */ }
    }
  });

  // 5. Expose the global API. `targetOrigin: '*'` is a v1 limitation;
  //    a future revision will accept the parent's origin and pin it.
  window.CozyCopilot = {
    open: function () { iframe.contentWindow.postMessage({ type: 'host:open' }, '*'); },
    close: function () { iframe.contentWindow.postMessage({ type: 'host:close' }, '*'); },
    send: function (msg) { iframe.contentWindow.postMessage(msg, '*'); },
    on: function (type, fn) {
      (handlers[type] = handlers[type] || []).push(fn);
    },
  };
})();