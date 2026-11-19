// SPDX-License-Identifier: MIT
// Copyright 2026, Lukáš Czerner <lukas@czerner.cz>
/// <reference types="vite/client" />
declare const __APP_VERSION__: string;
declare const __APP_COMMIT__: string;
declare module '*?raw' {
  const text: string;
  export default text;
}
