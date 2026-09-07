// Install shim, not an implementation.
//
// @ledgerhq/speculos-transport@0.10.6 does `require("@ledgerhq/live-dmk-speculos")`
// at module load. That package is not published on npm at any version, so the
// require fails and the whole Key Ring SDK becomes unimportable. This file
// satisfies the loader and nothing else.
//
// speculos-transport only reaches into it for the Device Management Kit
// transport, which is the non-websocket branch of createSpeculosDevice. Set
// SPECULOS_USE_WEBSOCKET=1 and that branch is never taken, so nothing here is
// ever called. If it is called, we want a loud failure rather than a silent
// wrong answer.
const fail = (name) => {
  throw new Error(
    "@ledgerhq/live-dmk-speculos is not published on npm; agent/vendor holds an install " +
      "shim only. Reached for `" + name + "`. Run Speculos with SPECULOS_USE_WEBSOCKET=1 " +
      "so the websocket transport is used instead.",
  );
};

module.exports = new Proxy(
  {},
  {
    get(_target, name) {
      if (name === "__esModule") return false;
      return fail(String(name));
    },
  },
);
