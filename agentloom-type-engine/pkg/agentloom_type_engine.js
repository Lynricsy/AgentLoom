/* @ts-self-types="./agentloom_type_engine.d.ts" */
import * as wasm from "./agentloom_type_engine_bg.wasm";
import { __wbg_set_wasm } from "./agentloom_type_engine_bg.js";

__wbg_set_wasm(wasm);
wasm.__wbindgen_start();
export {
    checkCompatibility
} from "./agentloom_type_engine_bg.js";
