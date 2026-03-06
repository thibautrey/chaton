(globalThis.TURBOPACK || (globalThis.TURBOPACK = [])).push([typeof document === "object" ? document.currentScript : undefined,
"[project]/gitRepo/dashboard/docs/node_modules/fumadocs-core/dist/toc.js [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "AnchorProvider",
    ()=>AnchorProvider,
    "ScrollProvider",
    ()=>ScrollProvider,
    "TOCItem",
    ()=>TOCItem,
    "useActiveAnchor",
    ()=>useActiveAnchor,
    "useActiveAnchors",
    ()=>useActiveAnchors
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/gitRepo/dashboard/docs/node_modules/next/dist/compiled/react/index.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/gitRepo/dashboard/docs/node_modules/next/dist/compiled/react/jsx-runtime.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$scroll$2d$into$2d$view$2d$if$2d$needed$2f$dist$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/gitRepo/dashboard/docs/node_modules/scroll-into-view-if-needed/dist/index.js [app-client] (ecmascript)");
'use client';
;
;
;
//#region src/utils/merge-refs.ts
function mergeRefs(...refs) {
    return (value)=>{
        refs.forEach((ref)=>{
            if (typeof ref === "function") ref(value);
            else if (ref != null) ref.current = value;
        });
    };
}
//#endregion
//#region src/toc.tsx
const ActiveAnchorContext = (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["createContext"])([]);
const ScrollContext = (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["createContext"])({
    current: null
});
/**
* The estimated active heading ID
*/ function useActiveAnchor() {
    return (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useContext"])(ActiveAnchorContext)[0];
}
/**
* The id of visible anchors
*/ function useActiveAnchors() {
    return (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useContext"])(ActiveAnchorContext);
}
function ScrollProvider({ containerRef, children }) {
    return /* @__PURE__ */ (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsx"])(ScrollContext.Provider, {
        value: containerRef,
        children
    });
}
function AnchorProvider({ toc, single = false, children }) {
    const headings = (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useMemo"])({
        "AnchorProvider.useMemo[headings]": ()=>{
            return toc.map({
                "AnchorProvider.useMemo[headings]": (item)=>item.url.split("#")[1]
            }["AnchorProvider.useMemo[headings]"]);
        }
    }["AnchorProvider.useMemo[headings]"], [
        toc
    ]);
    return /* @__PURE__ */ (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsx"])(ActiveAnchorContext.Provider, {
        value: useAnchorObserver(headings, single),
        children
    });
}
function TOCItem({ ref, onActiveChange = ()=>null, ...props }) {
    const containerRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useContext"])(ScrollContext);
    const anchorRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useRef"])(null);
    const activeOrder = useActiveAnchors().indexOf(props.href.slice(1));
    const isActive = activeOrder !== -1;
    const shouldScroll = activeOrder === 0;
    const onActiveChangeEvent = (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useEffectEvent"])(onActiveChange);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useLayoutEffect"])({
        "TOCItem.useLayoutEffect": ()=>{
            const anchor = anchorRef.current;
            const container = containerRef.current;
            if (container && anchor && shouldScroll) (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$scroll$2d$into$2d$view$2d$if$2d$needed$2f$dist$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"])(anchor, {
                behavior: "smooth",
                block: "center",
                inline: "center",
                scrollMode: "always",
                boundary: container
            });
        }
    }["TOCItem.useLayoutEffect"], [
        containerRef,
        shouldScroll
    ]);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useEffect"])({
        "TOCItem.useEffect": ()=>{
            return ({
                "TOCItem.useEffect": ()=>onActiveChangeEvent(isActive)
            })["TOCItem.useEffect"];
        }
    }["TOCItem.useEffect"], [
        isActive
    ]);
    return /* @__PURE__ */ (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsx"])("a", {
        ref: mergeRefs(anchorRef, ref),
        "data-active": isActive,
        ...props,
        children: props.children
    });
}
/**
* Find the active heading of page
*
* It selects the top heading by default, and the last item when reached the bottom of page.
*
* @param watch - An array of element ids to watch
* @param single - only one active item at most
* @returns Active anchor
*/ function useAnchorObserver(watch, single) {
    const observerRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useRef"])(null);
    const [activeAnchor, setActiveAnchor] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])({
        "useAnchorObserver.useState": ()=>[]
    }["useAnchorObserver.useState"]);
    const stateRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useRef"])(null);
    const onChange = (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useEffectEvent"])({
        "useAnchorObserver.useEffectEvent[onChange]": (entries)=>{
            stateRef.current ??= {
                visible: /* @__PURE__ */ new Set()
            };
            const state = stateRef.current;
            for (const entry of entries)if (entry.isIntersecting) state.visible.add(entry.target.id);
            else state.visible.delete(entry.target.id);
            if (state.visible.size === 0) {
                const viewTop = entries.length > 0 ? entries[0]?.rootBounds?.top ?? 0 : 0;
                let fallback;
                let min = -1;
                for (const id of watch){
                    const element = document.getElementById(id);
                    if (!element) continue;
                    const d = Math.abs(viewTop - element.getBoundingClientRect().top);
                    if (min === -1 || d < min) {
                        fallback = element;
                        min = d;
                    }
                }
                setActiveAnchor(fallback ? [
                    fallback.id
                ] : []);
            } else {
                const items = watch.filter({
                    "useAnchorObserver.useEffectEvent[onChange].items": (item)=>state.visible.has(item)
                }["useAnchorObserver.useEffectEvent[onChange].items"]);
                setActiveAnchor(single ? items.slice(0, 1) : items);
            }
        }
    }["useAnchorObserver.useEffectEvent[onChange]"]);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useEffect"])({
        "useAnchorObserver.useEffect": ()=>{
            if (observerRef.current) return;
            observerRef.current = new IntersectionObserver(onChange, {
                rootMargin: "0px",
                threshold: .98
            });
            return ({
                "useAnchorObserver.useEffect": ()=>{
                    observerRef.current?.disconnect();
                    observerRef.current = null;
                }
            })["useAnchorObserver.useEffect"];
        }
    }["useAnchorObserver.useEffect"], []);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useEffect"])({
        "useAnchorObserver.useEffect": ()=>{
            const observer = observerRef.current;
            if (!observer) return;
            const elements = watch.flatMap({
                "useAnchorObserver.useEffect.elements": (heading)=>document.getElementById(heading) ?? []
            }["useAnchorObserver.useEffect.elements"]);
            for (const element of elements)observer.observe(element);
            return ({
                "useAnchorObserver.useEffect": ()=>{
                    for (const element of elements)observer.unobserve(element);
                }
            })["useAnchorObserver.useEffect"];
        }
    }["useAnchorObserver.useEffect"], [
        watch
    ]);
    return activeAnchor;
}
;
}),
"[project]/gitRepo/dashboard/docs/node_modules/fumadocs-ui/dist/components/toc/index.js [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "TOCProvider",
    ()=>TOCProvider,
    "TOCScrollArea",
    ()=>TOCScrollArea,
    "TocThumb",
    ()=>TocThumb,
    "useTOCItems",
    ()=>useTOCItems
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$fumadocs$2d$ui$2f$dist$2f$utils$2f$cn$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$locals$3e$__ = __turbopack_context__.i("[project]/gitRepo/dashboard/docs/node_modules/fumadocs-ui/dist/utils/cn.js [app-client] (ecmascript) <locals>");
var __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$tailwind$2d$merge$2f$dist$2f$bundle$2d$mjs$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__twMerge__as__cn$3e$__ = __turbopack_context__.i("[project]/gitRepo/dashboard/docs/node_modules/tailwind-merge/dist/bundle-mjs.mjs [app-client] (ecmascript) <export twMerge as cn>");
var __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$fumadocs$2d$ui$2f$dist$2f$utils$2f$merge$2d$refs$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/gitRepo/dashboard/docs/node_modules/fumadocs-ui/dist/utils/merge-refs.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/gitRepo/dashboard/docs/node_modules/next/dist/compiled/react/index.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/gitRepo/dashboard/docs/node_modules/next/dist/compiled/react/jsx-runtime.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$fumadocs$2d$core$2f$dist$2f$toc$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/gitRepo/dashboard/docs/node_modules/fumadocs-core/dist/toc.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$fumadocs$2d$core$2f$dist$2f$utils$2f$use$2d$on$2d$change$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/gitRepo/dashboard/docs/node_modules/fumadocs-core/dist/utils/use-on-change.js [app-client] (ecmascript)");
'use client';
;
;
;
;
;
;
//#region src/components/toc/index.tsx
const TOCContext = (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["createContext"])([]);
function useTOCItems() {
    return (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["use"])(TOCContext);
}
function TOCProvider({ toc, children, ...props }) {
    return /* @__PURE__ */ (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsx"])(TOCContext, {
        value: toc,
        children: /* @__PURE__ */ (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsx"])(__TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$fumadocs$2d$core$2f$dist$2f$toc$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["AnchorProvider"], {
            toc,
            ...props,
            children
        })
    });
}
function TOCScrollArea({ ref, className, ...props }) {
    const viewRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useRef"])(null);
    return /* @__PURE__ */ (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsx"])("div", {
        ref: (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$fumadocs$2d$ui$2f$dist$2f$utils$2f$merge$2d$refs$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["mergeRefs"])(viewRef, ref),
        className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$tailwind$2d$merge$2f$dist$2f$bundle$2d$mjs$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__twMerge__as__cn$3e$__["cn"])("relative min-h-0 text-sm ms-px overflow-auto [scrollbar-width:none] mask-[linear-gradient(to_bottom,transparent,white_16px,white_calc(100%-16px),transparent)] py-3", className),
        ...props,
        children: /* @__PURE__ */ (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsx"])(__TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$fumadocs$2d$core$2f$dist$2f$toc$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["ScrollProvider"], {
            containerRef: viewRef,
            children: props.children
        })
    });
}
function TocThumb({ containerRef, ...props }) {
    const thumbRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useRef"])(null);
    const active = __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$fumadocs$2d$core$2f$dist$2f$toc$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useActiveAnchors"]();
    function update(info) {
        const element = thumbRef.current;
        if (!element) return;
        element.style.setProperty("--fd-top", `${info[0]}px`);
        element.style.setProperty("--fd-height", `${info[1]}px`);
    }
    const onPrint = (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useEffectEvent"])({
        "TocThumb.useEffectEvent[onPrint]": ()=>{
            if (containerRef.current) update(calc(containerRef.current, active));
        }
    }["TocThumb.useEffectEvent[onPrint]"]);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useEffect"])({
        "TocThumb.useEffect": ()=>{
            if (!containerRef.current) return;
            const container = containerRef.current;
            const observer = new ResizeObserver(onPrint);
            observer.observe(container);
            return ({
                "TocThumb.useEffect": ()=>{
                    observer.disconnect();
                }
            })["TocThumb.useEffect"];
        }
    }["TocThumb.useEffect"], [
        containerRef
    ]);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$fumadocs$2d$core$2f$dist$2f$utils$2f$use$2d$on$2d$change$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useOnChange"])(active, {
        "TocThumb.useOnChange": ()=>{
            if (containerRef.current) update(calc(containerRef.current, active));
        }
    }["TocThumb.useOnChange"]);
    return /* @__PURE__ */ (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsx"])("div", {
        ref: thumbRef,
        "data-hidden": active.length === 0,
        ...props
    });
}
function calc(container, active) {
    if (active.length === 0 || container.clientHeight === 0) return [
        0,
        0
    ];
    let upper = Number.MAX_VALUE, lower = 0;
    for (const item of active){
        const element = container.querySelector(`a[href="#${item}"]`);
        if (!element) continue;
        const styles = getComputedStyle(element);
        upper = Math.min(upper, element.offsetTop + parseFloat(styles.paddingTop));
        lower = Math.max(lower, element.offsetTop + element.clientHeight - parseFloat(styles.paddingBottom));
    }
    return [
        upper,
        lower - upper
    ];
}
;
}),
"[project]/gitRepo/dashboard/docs/node_modules/fumadocs-ui/dist/utils/use-footer-items.js [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "useFooterItems",
    ()=>useFooterItems
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$fumadocs$2d$ui$2f$dist$2f$contexts$2f$tree$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/gitRepo/dashboard/docs/node_modules/fumadocs-ui/dist/contexts/tree.js [app-client] (ecmascript)");
'use client';
;
//#region src/utils/use-footer-items.ts
const footerCache = /* @__PURE__ */ new Map();
/**
* @returns a list of page tree items (linear), that you can obtain footer items
*/ function useFooterItems() {
    const { root } = (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$fumadocs$2d$ui$2f$dist$2f$contexts$2f$tree$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useTreeContext"])();
    const cached = footerCache.get(root.$id);
    if (cached) return cached;
    const list = [];
    function onNode(node) {
        if (node.type === "folder") {
            if (node.index) onNode(node.index);
            for (const child of node.children)onNode(child);
        } else if (node.type === "page" && !node.external) list.push(node);
    }
    for (const child of root.children)onNode(child);
    footerCache.set(root.$id, list);
    return list;
}
;
}),
"[project]/gitRepo/dashboard/docs/node_modules/fumadocs-ui/node_modules/lucide-react/dist/esm/icons/chevron-left.js [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "__iconNode",
    ()=>__iconNode,
    "default",
    ()=>ChevronLeft
]);
/**
 * @license lucide-react v0.575.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */ var __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$fumadocs$2d$ui$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$createLucideIcon$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/gitRepo/dashboard/docs/node_modules/fumadocs-ui/node_modules/lucide-react/dist/esm/createLucideIcon.js [app-client] (ecmascript)");
;
const __iconNode = [
    [
        "path",
        {
            d: "m15 18-6-6 6-6",
            key: "1wnfg3"
        }
    ]
];
const ChevronLeft = (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$fumadocs$2d$ui$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$createLucideIcon$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"])("chevron-left", __iconNode);
;
 //# sourceMappingURL=chevron-left.js.map
}),
"[project]/gitRepo/dashboard/docs/node_modules/fumadocs-ui/node_modules/lucide-react/dist/esm/icons/chevron-left.js [app-client] (ecmascript) <export default as ChevronLeft>", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "ChevronLeft",
    ()=>__TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$fumadocs$2d$ui$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$chevron$2d$left$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"]
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$fumadocs$2d$ui$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$chevron$2d$left$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/gitRepo/dashboard/docs/node_modules/fumadocs-ui/node_modules/lucide-react/dist/esm/icons/chevron-left.js [app-client] (ecmascript)");
}),
"[project]/gitRepo/dashboard/docs/node_modules/fumadocs-ui/node_modules/lucide-react/dist/esm/icons/chevron-right.js [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "__iconNode",
    ()=>__iconNode,
    "default",
    ()=>ChevronRight
]);
/**
 * @license lucide-react v0.575.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */ var __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$fumadocs$2d$ui$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$createLucideIcon$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/gitRepo/dashboard/docs/node_modules/fumadocs-ui/node_modules/lucide-react/dist/esm/createLucideIcon.js [app-client] (ecmascript)");
;
const __iconNode = [
    [
        "path",
        {
            d: "m9 18 6-6-6-6",
            key: "mthhwq"
        }
    ]
];
const ChevronRight = (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$fumadocs$2d$ui$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$createLucideIcon$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"])("chevron-right", __iconNode);
;
 //# sourceMappingURL=chevron-right.js.map
}),
"[project]/gitRepo/dashboard/docs/node_modules/fumadocs-ui/node_modules/lucide-react/dist/esm/icons/chevron-right.js [app-client] (ecmascript) <export default as ChevronRight>", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "ChevronRight",
    ()=>__TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$fumadocs$2d$ui$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$chevron$2d$right$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"]
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$fumadocs$2d$ui$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$chevron$2d$right$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/gitRepo/dashboard/docs/node_modules/fumadocs-ui/node_modules/lucide-react/dist/esm/icons/chevron-right.js [app-client] (ecmascript)");
}),
"[project]/gitRepo/dashboard/docs/node_modules/fumadocs-ui/dist/layouts/docs/page/client.js [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "PageBreadcrumb",
    ()=>PageBreadcrumb,
    "PageFooter",
    ()=>PageFooter,
    "PageLastUpdate",
    ()=>PageLastUpdate,
    "PageTOCPopover",
    ()=>PageTOCPopover,
    "PageTOCPopoverContent",
    ()=>PageTOCPopoverContent,
    "PageTOCPopoverTrigger",
    ()=>PageTOCPopoverTrigger
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$fumadocs$2d$ui$2f$dist$2f$contexts$2f$i18n$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/gitRepo/dashboard/docs/node_modules/fumadocs-ui/dist/contexts/i18n.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$fumadocs$2d$ui$2f$dist$2f$utils$2f$cn$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$locals$3e$__ = __turbopack_context__.i("[project]/gitRepo/dashboard/docs/node_modules/fumadocs-ui/dist/utils/cn.js [app-client] (ecmascript) <locals>");
var __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$tailwind$2d$merge$2f$dist$2f$bundle$2d$mjs$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__twMerge__as__cn$3e$__ = __turbopack_context__.i("[project]/gitRepo/dashboard/docs/node_modules/tailwind-merge/dist/bundle-mjs.mjs [app-client] (ecmascript) <export twMerge as cn>");
var __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$fumadocs$2d$ui$2f$dist$2f$contexts$2f$tree$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/gitRepo/dashboard/docs/node_modules/fumadocs-ui/dist/contexts/tree.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$fumadocs$2d$ui$2f$dist$2f$utils$2f$urls$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/gitRepo/dashboard/docs/node_modules/fumadocs-ui/dist/utils/urls.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$fumadocs$2d$ui$2f$dist$2f$components$2f$ui$2f$collapsible$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/gitRepo/dashboard/docs/node_modules/fumadocs-ui/dist/components/ui/collapsible.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$fumadocs$2d$ui$2f$dist$2f$components$2f$toc$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/gitRepo/dashboard/docs/node_modules/fumadocs-ui/dist/components/toc/index.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$fumadocs$2d$ui$2f$dist$2f$layouts$2f$docs$2f$client$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/gitRepo/dashboard/docs/node_modules/fumadocs-ui/dist/layouts/docs/client.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$fumadocs$2d$ui$2f$dist$2f$utils$2f$use$2d$footer$2d$items$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/gitRepo/dashboard/docs/node_modules/fumadocs-ui/dist/utils/use-footer-items.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/gitRepo/dashboard/docs/node_modules/next/dist/compiled/react/index.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$fumadocs$2d$core$2f$dist$2f$framework$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/gitRepo/dashboard/docs/node_modules/fumadocs-core/dist/framework/index.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/gitRepo/dashboard/docs/node_modules/next/dist/compiled/react/jsx-runtime.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$fumadocs$2d$core$2f$dist$2f$link$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/gitRepo/dashboard/docs/node_modules/fumadocs-core/dist/link.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$fumadocs$2d$ui$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$chevron$2d$down$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__ChevronDown$3e$__ = __turbopack_context__.i("[project]/gitRepo/dashboard/docs/node_modules/fumadocs-ui/node_modules/lucide-react/dist/esm/icons/chevron-down.js [app-client] (ecmascript) <export default as ChevronDown>");
var __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$fumadocs$2d$ui$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$chevron$2d$left$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__ChevronLeft$3e$__ = __turbopack_context__.i("[project]/gitRepo/dashboard/docs/node_modules/fumadocs-ui/node_modules/lucide-react/dist/esm/icons/chevron-left.js [app-client] (ecmascript) <export default as ChevronLeft>");
var __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$fumadocs$2d$ui$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$chevron$2d$right$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__ChevronRight$3e$__ = __turbopack_context__.i("[project]/gitRepo/dashboard/docs/node_modules/fumadocs-ui/node_modules/lucide-react/dist/esm/icons/chevron-right.js [app-client] (ecmascript) <export default as ChevronRight>");
var __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$fumadocs$2d$core$2f$dist$2f$breadcrumb$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/gitRepo/dashboard/docs/node_modules/fumadocs-core/dist/breadcrumb.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$fumadocs$2d$core$2f$dist$2f$toc$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/gitRepo/dashboard/docs/node_modules/fumadocs-core/dist/toc.js [app-client] (ecmascript)");
'use client';
;
;
;
;
;
;
;
;
;
;
;
;
;
;
;
//#region src/layouts/docs/page/client.tsx
const TocPopoverContext = (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["createContext"])(null);
function PageTOCPopover({ className, children, ...rest }) {
    const ref = (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useRef"])(null);
    const [open, setOpen] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(false);
    const { isNavTransparent } = (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["use"])(__TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$fumadocs$2d$ui$2f$dist$2f$layouts$2f$docs$2f$client$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["LayoutContext"]);
    const onClick = (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useEffectEvent"])({
        "PageTOCPopover.useEffectEvent[onClick]": (e)=>{
            if (!open) return;
            if (ref.current && !ref.current.contains(e.target)) setOpen(false);
        }
    }["PageTOCPopover.useEffectEvent[onClick]"]);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useEffect"])({
        "PageTOCPopover.useEffect": ()=>{
            window.addEventListener("click", onClick);
            return ({
                "PageTOCPopover.useEffect": ()=>{
                    window.removeEventListener("click", onClick);
                }
            })["PageTOCPopover.useEffect"];
        }
    }["PageTOCPopover.useEffect"], []);
    return /* @__PURE__ */ (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsx"])(TocPopoverContext, {
        value: (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useMemo"])({
            "PageTOCPopover.useMemo": ()=>({
                    open,
                    setOpen
                })
        }["PageTOCPopover.useMemo"], [
            setOpen,
            open
        ]),
        children: /* @__PURE__ */ (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsx"])(__TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$fumadocs$2d$ui$2f$dist$2f$components$2f$ui$2f$collapsible$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Collapsible"], {
            open,
            onOpenChange: setOpen,
            "data-toc-popover": "",
            className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$tailwind$2d$merge$2f$dist$2f$bundle$2d$mjs$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__twMerge__as__cn$3e$__["cn"])("sticky top-(--fd-docs-row-2) z-10 [grid-area:toc-popover] h-(--fd-toc-popover-height) xl:hidden max-xl:layout:[--fd-toc-popover-height:--spacing(10)]", className),
            ...rest,
            children: /* @__PURE__ */ (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsx"])("header", {
                ref,
                className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$tailwind$2d$merge$2f$dist$2f$bundle$2d$mjs$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__twMerge__as__cn$3e$__["cn"])("border-b backdrop-blur-sm transition-colors", (!isNavTransparent || open) && "bg-fd-background/80", open && "shadow-lg"),
                children
            })
        })
    });
}
function PageTOCPopoverTrigger({ className, ...props }) {
    const { text } = (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$fumadocs$2d$ui$2f$dist$2f$contexts$2f$i18n$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useI18n"])();
    const { open } = (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["use"])(TocPopoverContext);
    const items = (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$fumadocs$2d$ui$2f$dist$2f$components$2f$toc$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useTOCItems"])();
    const active = (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$fumadocs$2d$core$2f$dist$2f$toc$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useActiveAnchor"])();
    const selected = (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useMemo"])({
        "PageTOCPopoverTrigger.useMemo[selected]": ()=>items.findIndex({
                "PageTOCPopoverTrigger.useMemo[selected]": (item)=>active === item.url.slice(1)
            }["PageTOCPopoverTrigger.useMemo[selected]"])
    }["PageTOCPopoverTrigger.useMemo[selected]"], [
        items,
        active
    ]);
    const path = (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$fumadocs$2d$ui$2f$dist$2f$contexts$2f$tree$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useTreePath"])().at(-1);
    const showItem = selected !== -1 && !open;
    return /* @__PURE__ */ (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxs"])(__TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$fumadocs$2d$ui$2f$dist$2f$components$2f$ui$2f$collapsible$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["CollapsibleTrigger"], {
        className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$tailwind$2d$merge$2f$dist$2f$bundle$2d$mjs$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__twMerge__as__cn$3e$__["cn"])("flex w-full h-10 items-center text-sm text-fd-muted-foreground gap-2.5 px-4 py-2.5 text-start focus-visible:outline-none [&_svg]:size-4 md:px-6", className),
        "data-toc-popover-trigger": "",
        ...props,
        children: [
            /* @__PURE__ */ (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsx"])(ProgressCircle, {
                value: (selected + 1) / Math.max(1, items.length),
                max: 1,
                className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$tailwind$2d$merge$2f$dist$2f$bundle$2d$mjs$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__twMerge__as__cn$3e$__["cn"])("shrink-0", open && "text-fd-primary")
            }),
            /* @__PURE__ */ (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxs"])("span", {
                className: "grid flex-1 *:my-auto *:row-start-1 *:col-start-1",
                children: [
                    /* @__PURE__ */ (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsx"])("span", {
                        className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$tailwind$2d$merge$2f$dist$2f$bundle$2d$mjs$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__twMerge__as__cn$3e$__["cn"])("truncate transition-[opacity,translate,color]", open && "text-fd-foreground", showItem && "opacity-0 -translate-y-full pointer-events-none"),
                        children: path?.name ?? text.toc
                    }),
                    /* @__PURE__ */ (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsx"])("span", {
                        className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$tailwind$2d$merge$2f$dist$2f$bundle$2d$mjs$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__twMerge__as__cn$3e$__["cn"])("truncate transition-[opacity,translate]", !showItem && "opacity-0 translate-y-full pointer-events-none"),
                        children: items[selected]?.title
                    })
                ]
            }),
            /* @__PURE__ */ (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsx"])(__TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$fumadocs$2d$ui$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$chevron$2d$down$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__ChevronDown$3e$__["ChevronDown"], {
                className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$tailwind$2d$merge$2f$dist$2f$bundle$2d$mjs$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__twMerge__as__cn$3e$__["cn"])("shrink-0 transition-transform mx-0.5", open && "rotate-180")
            })
        ]
    });
}
function clamp(input, min, max) {
    if (input < min) return min;
    if (input > max) return max;
    return input;
}
function ProgressCircle({ value, strokeWidth = 2, size = 24, min = 0, max = 100, ...restSvgProps }) {
    const normalizedValue = clamp(value, min, max);
    const radius = (size - strokeWidth) / 2;
    const circumference = 2 * Math.PI * radius;
    const progress = normalizedValue / max * circumference;
    const circleProps = {
        cx: size / 2,
        cy: size / 2,
        r: radius,
        fill: "none",
        strokeWidth
    };
    return /* @__PURE__ */ (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxs"])("svg", {
        role: "progressbar",
        viewBox: `0 0 ${size} ${size}`,
        "aria-valuenow": normalizedValue,
        "aria-valuemin": min,
        "aria-valuemax": max,
        ...restSvgProps,
        children: [
            /* @__PURE__ */ (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsx"])("circle", {
                ...circleProps,
                className: "stroke-current/25"
            }),
            /* @__PURE__ */ (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsx"])("circle", {
                ...circleProps,
                stroke: "currentColor",
                strokeDasharray: circumference,
                strokeDashoffset: circumference - progress,
                strokeLinecap: "round",
                transform: `rotate(-90 ${size / 2} ${size / 2})`,
                className: "transition-all"
            })
        ]
    });
}
function PageTOCPopoverContent(props) {
    return /* @__PURE__ */ (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsx"])(__TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$fumadocs$2d$ui$2f$dist$2f$components$2f$ui$2f$collapsible$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["CollapsibleContent"], {
        "data-toc-popover-content": "",
        ...props,
        className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$tailwind$2d$merge$2f$dist$2f$bundle$2d$mjs$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__twMerge__as__cn$3e$__["cn"])("flex flex-col px-4 max-h-[50vh] md:px-6", props.className),
        children: props.children
    });
}
function PageLastUpdate({ date: value, ...props }) {
    const { text } = (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$fumadocs$2d$ui$2f$dist$2f$contexts$2f$i18n$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useI18n"])();
    const [date, setDate] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])("");
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useEffect"])({
        "PageLastUpdate.useEffect": ()=>{
            setDate(value.toLocaleDateString());
        }
    }["PageLastUpdate.useEffect"], [
        value
    ]);
    return /* @__PURE__ */ (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxs"])("p", {
        ...props,
        className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$tailwind$2d$merge$2f$dist$2f$bundle$2d$mjs$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__twMerge__as__cn$3e$__["cn"])("text-sm text-fd-muted-foreground", props.className),
        children: [
            text.lastUpdate,
            " ",
            date
        ]
    });
}
function PageFooter({ items, children, className, ...props }) {
    const footerList = (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$fumadocs$2d$ui$2f$dist$2f$utils$2f$use$2d$footer$2d$items$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useFooterItems"])();
    const pathname = (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$fumadocs$2d$core$2f$dist$2f$framework$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["usePathname"])();
    const { previous, next } = (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useMemo"])({
        "PageFooter.useMemo": ()=>{
            if (items) return items;
            const idx = footerList.findIndex({
                "PageFooter.useMemo.idx": (item)=>(0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$fumadocs$2d$ui$2f$dist$2f$utils$2f$urls$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["isActive"])(item.url, pathname)
            }["PageFooter.useMemo.idx"]);
            if (idx === -1) return {};
            return {
                previous: footerList[idx - 1],
                next: footerList[idx + 1]
            };
        }
    }["PageFooter.useMemo"], [
        footerList,
        items,
        pathname
    ]);
    return /* @__PURE__ */ (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxs"])(__TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Fragment"], {
        children: [
            /* @__PURE__ */ (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxs"])("div", {
                className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$tailwind$2d$merge$2f$dist$2f$bundle$2d$mjs$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__twMerge__as__cn$3e$__["cn"])("@container grid gap-4", previous && next ? "grid-cols-2" : "grid-cols-1", className),
                ...props,
                children: [
                    previous && /* @__PURE__ */ (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsx"])(FooterItem, {
                        item: previous,
                        index: 0
                    }),
                    next && /* @__PURE__ */ (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsx"])(FooterItem, {
                        item: next,
                        index: 1
                    })
                ]
            }),
            children
        ]
    });
}
function FooterItem({ item, index }) {
    const { text } = (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$fumadocs$2d$ui$2f$dist$2f$contexts$2f$i18n$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useI18n"])();
    const Icon = index === 0 ? __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$fumadocs$2d$ui$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$chevron$2d$left$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__ChevronLeft$3e$__["ChevronLeft"] : __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$fumadocs$2d$ui$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$chevron$2d$right$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__ChevronRight$3e$__["ChevronRight"];
    return /* @__PURE__ */ (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxs"])(__TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$fumadocs$2d$core$2f$dist$2f$link$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"], {
        href: item.url,
        className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$tailwind$2d$merge$2f$dist$2f$bundle$2d$mjs$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__twMerge__as__cn$3e$__["cn"])("flex flex-col gap-2 rounded-lg border p-4 text-sm transition-colors hover:bg-fd-accent/80 hover:text-fd-accent-foreground @max-lg:col-span-full", index === 1 && "text-end"),
        children: [
            /* @__PURE__ */ (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxs"])("div", {
                className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$tailwind$2d$merge$2f$dist$2f$bundle$2d$mjs$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__twMerge__as__cn$3e$__["cn"])("inline-flex items-center gap-1.5 font-medium", index === 1 && "flex-row-reverse"),
                children: [
                    /* @__PURE__ */ (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsx"])(Icon, {
                        className: "-mx-1 size-4 shrink-0 rtl:rotate-180"
                    }),
                    /* @__PURE__ */ (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsx"])("p", {
                        children: item.name
                    })
                ]
            }),
            /* @__PURE__ */ (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsx"])("p", {
                className: "text-fd-muted-foreground truncate",
                children: item.description ?? (index === 0 ? text.previousPage : text.nextPage)
            })
        ]
    });
}
function PageBreadcrumb({ includeRoot, includeSeparator, includePage, ...props }) {
    const path = (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$fumadocs$2d$ui$2f$dist$2f$contexts$2f$tree$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useTreePath"])();
    const { root } = (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$fumadocs$2d$ui$2f$dist$2f$contexts$2f$tree$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useTreeContext"])();
    const items = (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useMemo"])({
        "PageBreadcrumb.useMemo[items]": ()=>{
            return (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$fumadocs$2d$core$2f$dist$2f$breadcrumb$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["getBreadcrumbItemsFromPath"])(root, path, {
                includePage,
                includeSeparator,
                includeRoot
            });
        }
    }["PageBreadcrumb.useMemo[items]"], [
        includePage,
        includeRoot,
        includeSeparator,
        path,
        root
    ]);
    if (items.length === 0) return null;
    return /* @__PURE__ */ (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsx"])("div", {
        ...props,
        className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$tailwind$2d$merge$2f$dist$2f$bundle$2d$mjs$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__twMerge__as__cn$3e$__["cn"])("flex items-center gap-1.5 text-sm text-fd-muted-foreground", props.className),
        children: items.map((item, i)=>{
            const className = (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$tailwind$2d$merge$2f$dist$2f$bundle$2d$mjs$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__twMerge__as__cn$3e$__["cn"])("truncate", i === items.length - 1 && "text-fd-primary font-medium");
            return /* @__PURE__ */ (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxs"])(__TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Fragment"], {
                children: [
                    i !== 0 && /* @__PURE__ */ (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsx"])(__TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$fumadocs$2d$ui$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$chevron$2d$right$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__ChevronRight$3e$__["ChevronRight"], {
                        className: "size-3.5 shrink-0"
                    }),
                    item.url ? /* @__PURE__ */ (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsx"])(__TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$fumadocs$2d$core$2f$dist$2f$link$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"], {
                        href: item.url,
                        className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$tailwind$2d$merge$2f$dist$2f$bundle$2d$mjs$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__twMerge__as__cn$3e$__["cn"])(className, "transition-opacity hover:opacity-80"),
                        children: item.name
                    }) : /* @__PURE__ */ (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsx"])("span", {
                        className,
                        children: item.name
                    })
                ]
            }, i);
        })
    });
}
;
}),
"[project]/gitRepo/dashboard/docs/node_modules/fumadocs-ui/dist/_virtual/_rolldown/runtime.js [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "__exportAll",
    ()=>__exportAll
]);
//#region \0rolldown/runtime.js
var __defProp = Object.defineProperty;
var __exportAll = (all, no_symbols)=>{
    let target = {};
    for(var name in all){
        __defProp(target, name, {
            get: all[name],
            enumerable: true
        });
    }
    if (!no_symbols) {
        __defProp(target, Symbol.toStringTag, {
            value: "Module"
        });
    }
    return target;
};
;
}),
"[project]/gitRepo/dashboard/docs/node_modules/fumadocs-ui/dist/components/toc/default.js [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "TOCItems",
    ()=>TOCItems
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$fumadocs$2d$ui$2f$dist$2f$contexts$2f$i18n$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/gitRepo/dashboard/docs/node_modules/fumadocs-ui/dist/contexts/i18n.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$fumadocs$2d$ui$2f$dist$2f$utils$2f$cn$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$locals$3e$__ = __turbopack_context__.i("[project]/gitRepo/dashboard/docs/node_modules/fumadocs-ui/dist/utils/cn.js [app-client] (ecmascript) <locals>");
var __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$tailwind$2d$merge$2f$dist$2f$bundle$2d$mjs$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__twMerge__as__cn$3e$__ = __turbopack_context__.i("[project]/gitRepo/dashboard/docs/node_modules/tailwind-merge/dist/bundle-mjs.mjs [app-client] (ecmascript) <export twMerge as cn>");
var __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$fumadocs$2d$ui$2f$dist$2f$utils$2f$merge$2d$refs$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/gitRepo/dashboard/docs/node_modules/fumadocs-ui/dist/utils/merge-refs.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$fumadocs$2d$ui$2f$dist$2f$components$2f$toc$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/gitRepo/dashboard/docs/node_modules/fumadocs-ui/dist/components/toc/index.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/gitRepo/dashboard/docs/node_modules/next/dist/compiled/react/index.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/gitRepo/dashboard/docs/node_modules/next/dist/compiled/react/jsx-runtime.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$fumadocs$2d$core$2f$dist$2f$toc$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/gitRepo/dashboard/docs/node_modules/fumadocs-core/dist/toc.js [app-client] (ecmascript)");
'use client';
;
;
;
;
;
;
;
//#region src/components/toc/default.tsx
function TOCItems({ ref, className, ...props }) {
    const containerRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useRef"])(null);
    const items = (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$fumadocs$2d$ui$2f$dist$2f$components$2f$toc$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useTOCItems"])();
    const { text } = (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$fumadocs$2d$ui$2f$dist$2f$contexts$2f$i18n$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useI18n"])();
    if (items.length === 0) return /* @__PURE__ */ (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsx"])("div", {
        className: "rounded-lg border bg-fd-card p-3 text-xs text-fd-muted-foreground",
        children: text.tocNoHeadings
    });
    return /* @__PURE__ */ (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxs"])(__TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Fragment"], {
        children: [
            /* @__PURE__ */ (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsx"])(__TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$fumadocs$2d$ui$2f$dist$2f$components$2f$toc$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["TocThumb"], {
                containerRef,
                className: "absolute top-(--fd-top) h-(--fd-height) w-0.5 rounded-e-sm bg-fd-primary transition-[top,height] ease-linear"
            }),
            /* @__PURE__ */ (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsx"])("div", {
                ref: (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$fumadocs$2d$ui$2f$dist$2f$utils$2f$merge$2d$refs$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["mergeRefs"])(ref, containerRef),
                className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$tailwind$2d$merge$2f$dist$2f$bundle$2d$mjs$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__twMerge__as__cn$3e$__["cn"])("flex flex-col border-s border-fd-foreground/10", className),
                ...props,
                children: items.map((item)=>/* @__PURE__ */ (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsx"])(TOCItem, {
                        item
                    }, item.url))
            })
        ]
    });
}
function TOCItem({ item }) {
    return /* @__PURE__ */ (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsx"])(__TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$fumadocs$2d$core$2f$dist$2f$toc$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["TOCItem"], {
        href: item.url,
        className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$tailwind$2d$merge$2f$dist$2f$bundle$2d$mjs$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__twMerge__as__cn$3e$__["cn"])("prose py-1.5 text-sm text-fd-muted-foreground transition-colors wrap-anywhere first:pt-0 last:pb-0 data-[active=true]:text-fd-primary", item.depth <= 2 && "ps-3", item.depth === 3 && "ps-6", item.depth >= 4 && "ps-8"),
        children: item.title
    });
}
;
}),
"[project]/gitRepo/dashboard/docs/node_modules/fumadocs-ui/dist/components/toc/clerk.js [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "TOCItems",
    ()=>TOCItems
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$fumadocs$2d$ui$2f$dist$2f$contexts$2f$i18n$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/gitRepo/dashboard/docs/node_modules/fumadocs-ui/dist/contexts/i18n.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$fumadocs$2d$ui$2f$dist$2f$utils$2f$cn$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$locals$3e$__ = __turbopack_context__.i("[project]/gitRepo/dashboard/docs/node_modules/fumadocs-ui/dist/utils/cn.js [app-client] (ecmascript) <locals>");
var __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$tailwind$2d$merge$2f$dist$2f$bundle$2d$mjs$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__twMerge__as__cn$3e$__ = __turbopack_context__.i("[project]/gitRepo/dashboard/docs/node_modules/tailwind-merge/dist/bundle-mjs.mjs [app-client] (ecmascript) <export twMerge as cn>");
var __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$fumadocs$2d$ui$2f$dist$2f$utils$2f$merge$2d$refs$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/gitRepo/dashboard/docs/node_modules/fumadocs-ui/dist/utils/merge-refs.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$fumadocs$2d$ui$2f$dist$2f$components$2f$toc$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/gitRepo/dashboard/docs/node_modules/fumadocs-ui/dist/components/toc/index.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/gitRepo/dashboard/docs/node_modules/next/dist/compiled/react/index.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/gitRepo/dashboard/docs/node_modules/next/dist/compiled/react/jsx-runtime.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$fumadocs$2d$core$2f$dist$2f$toc$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/gitRepo/dashboard/docs/node_modules/fumadocs-core/dist/toc.js [app-client] (ecmascript)");
'use client';
;
;
;
;
;
;
;
//#region src/components/toc/clerk.tsx
function TOCItems({ ref, className, ...props }) {
    const containerRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useRef"])(null);
    const items = (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$fumadocs$2d$ui$2f$dist$2f$components$2f$toc$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useTOCItems"])();
    const { text } = (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$fumadocs$2d$ui$2f$dist$2f$contexts$2f$i18n$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useI18n"])();
    const [svg, setSvg] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])();
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useEffect"])({
        "TOCItems.useEffect": ()=>{
            if (!containerRef.current) return;
            const container = containerRef.current;
            function onResize() {
                if (container.clientHeight === 0) return;
                let w = 0, h = 0;
                const d = [];
                for(let i = 0; i < items.length; i++){
                    const element = container.querySelector(`a[href="#${items[i].url.slice(1)}"]`);
                    if (!element) continue;
                    const styles = getComputedStyle(element);
                    const offset = getLineOffset(items[i].depth) + 1, top = element.offsetTop + parseFloat(styles.paddingTop), bottom = element.offsetTop + element.clientHeight - parseFloat(styles.paddingBottom);
                    w = Math.max(offset, w);
                    h = Math.max(h, bottom);
                    d.push(`${i === 0 ? "M" : "L"}${offset} ${top}`);
                    d.push(`L${offset} ${bottom}`);
                }
                setSvg({
                    path: d.join(" "),
                    width: w + 1,
                    height: h
                });
            }
            const observer = new ResizeObserver(onResize);
            onResize();
            observer.observe(container);
            return ({
                "TOCItems.useEffect": ()=>{
                    observer.disconnect();
                }
            })["TOCItems.useEffect"];
        }
    }["TOCItems.useEffect"], [
        items
    ]);
    if (items.length === 0) return /* @__PURE__ */ (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsx"])("div", {
        className: "rounded-lg border bg-fd-card p-3 text-xs text-fd-muted-foreground",
        children: text.tocNoHeadings
    });
    return /* @__PURE__ */ (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxs"])(__TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Fragment"], {
        children: [
            svg && /* @__PURE__ */ (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsx"])("div", {
                className: "absolute start-0 top-0 rtl:-scale-x-100",
                style: {
                    width: svg.width,
                    height: svg.height,
                    maskImage: `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${svg.width} ${svg.height}"><path d="${svg.path}" stroke="black" stroke-width="1" fill="none" /></svg>`)}")`
                },
                children: /* @__PURE__ */ (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsx"])(__TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$fumadocs$2d$ui$2f$dist$2f$components$2f$toc$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["TocThumb"], {
                    containerRef,
                    className: "absolute w-full top-(--fd-top) h-(--fd-height) bg-fd-primary transition-[top,height]"
                })
            }),
            /* @__PURE__ */ (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsx"])("div", {
                ref: (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$fumadocs$2d$ui$2f$dist$2f$utils$2f$merge$2d$refs$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["mergeRefs"])(containerRef, ref),
                className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$tailwind$2d$merge$2f$dist$2f$bundle$2d$mjs$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__twMerge__as__cn$3e$__["cn"])("flex flex-col", className),
                ...props,
                children: items.map((item, i)=>/* @__PURE__ */ (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsx"])(TOCItem, {
                        item,
                        upper: items[i - 1]?.depth,
                        lower: items[i + 1]?.depth
                    }, item.url))
            })
        ]
    });
}
function getItemOffset(depth) {
    if (depth <= 2) return 14;
    if (depth === 3) return 26;
    return 36;
}
function getLineOffset(depth) {
    return depth >= 3 ? 10 : 0;
}
function TOCItem({ item, upper = item.depth, lower = item.depth }) {
    const offset = getLineOffset(item.depth), upperOffset = getLineOffset(upper), lowerOffset = getLineOffset(lower);
    return /* @__PURE__ */ (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxs"])(__TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$fumadocs$2d$core$2f$dist$2f$toc$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["TOCItem"], {
        href: item.url,
        style: {
            paddingInlineStart: getItemOffset(item.depth)
        },
        className: "prose relative py-1.5 text-sm text-fd-muted-foreground hover:text-fd-accent-foreground transition-colors wrap-anywhere first:pt-0 last:pb-0 data-[active=true]:text-fd-primary",
        children: [
            offset !== upperOffset && /* @__PURE__ */ (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsx"])("svg", {
                xmlns: "http://www.w3.org/2000/svg",
                viewBox: "0 0 16 16",
                className: "absolute -top-1.5 start-0 size-4 rtl:-scale-x-100",
                children: /* @__PURE__ */ (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsx"])("line", {
                    x1: upperOffset,
                    y1: "0",
                    x2: offset,
                    y2: "12",
                    className: "stroke-fd-foreground/10",
                    strokeWidth: "1"
                })
            }),
            /* @__PURE__ */ (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsx"])("div", {
                className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$tailwind$2d$merge$2f$dist$2f$bundle$2d$mjs$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__twMerge__as__cn$3e$__["cn"])("absolute inset-y-0 w-px bg-fd-foreground/10", offset !== upperOffset && "top-1.5", offset !== lowerOffset && "bottom-1.5"),
                style: {
                    insetInlineStart: offset
                }
            }),
            item.title
        ]
    });
}
;
}),
"[project]/gitRepo/dashboard/docs/node_modules/fumadocs-ui/node_modules/lucide-react/dist/esm/icons/square-pen.js [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "__iconNode",
    ()=>__iconNode,
    "default",
    ()=>SquarePen
]);
/**
 * @license lucide-react v0.575.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */ var __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$fumadocs$2d$ui$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$createLucideIcon$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/gitRepo/dashboard/docs/node_modules/fumadocs-ui/node_modules/lucide-react/dist/esm/createLucideIcon.js [app-client] (ecmascript)");
;
const __iconNode = [
    [
        "path",
        {
            d: "M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7",
            key: "1m0v6g"
        }
    ],
    [
        "path",
        {
            d: "M18.375 2.625a1 1 0 0 1 3 3l-9.013 9.014a2 2 0 0 1-.853.505l-2.873.84a.5.5 0 0 1-.62-.62l.84-2.873a2 2 0 0 1 .506-.852z",
            key: "ohrbg2"
        }
    ]
];
const SquarePen = (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$fumadocs$2d$ui$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$createLucideIcon$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"])("square-pen", __iconNode);
;
 //# sourceMappingURL=square-pen.js.map
}),
"[project]/gitRepo/dashboard/docs/node_modules/fumadocs-ui/node_modules/lucide-react/dist/esm/icons/square-pen.js [app-client] (ecmascript) <export default as Edit>", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "Edit",
    ()=>__TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$fumadocs$2d$ui$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$square$2d$pen$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"]
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$fumadocs$2d$ui$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$square$2d$pen$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/gitRepo/dashboard/docs/node_modules/fumadocs-ui/node_modules/lucide-react/dist/esm/icons/square-pen.js [app-client] (ecmascript)");
}),
"[project]/gitRepo/dashboard/docs/node_modules/fumadocs-ui/node_modules/lucide-react/dist/esm/icons/text-align-start.js [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "__iconNode",
    ()=>__iconNode,
    "default",
    ()=>TextAlignStart
]);
/**
 * @license lucide-react v0.575.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */ var __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$fumadocs$2d$ui$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$createLucideIcon$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/gitRepo/dashboard/docs/node_modules/fumadocs-ui/node_modules/lucide-react/dist/esm/createLucideIcon.js [app-client] (ecmascript)");
;
const __iconNode = [
    [
        "path",
        {
            d: "M21 5H3",
            key: "1fi0y6"
        }
    ],
    [
        "path",
        {
            d: "M15 12H3",
            key: "6jk70r"
        }
    ],
    [
        "path",
        {
            d: "M17 19H3",
            key: "z6ezky"
        }
    ]
];
const TextAlignStart = (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$fumadocs$2d$ui$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$createLucideIcon$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"])("text-align-start", __iconNode);
;
 //# sourceMappingURL=text-align-start.js.map
}),
"[project]/gitRepo/dashboard/docs/node_modules/fumadocs-ui/node_modules/lucide-react/dist/esm/icons/text-align-start.js [app-client] (ecmascript) <export default as Text>", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "Text",
    ()=>__TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$fumadocs$2d$ui$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$text$2d$align$2d$start$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"]
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$fumadocs$2d$ui$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$text$2d$align$2d$start$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/gitRepo/dashboard/docs/node_modules/fumadocs-ui/node_modules/lucide-react/dist/esm/icons/text-align-start.js [app-client] (ecmascript)");
}),
"[project]/gitRepo/dashboard/docs/node_modules/fumadocs-ui/dist/layouts/docs/page/index.js [app-client] (ecmascript) <locals>", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "DocsBody",
    ()=>DocsBody,
    "DocsDescription",
    ()=>DocsDescription,
    "DocsPage",
    ()=>DocsPage,
    "DocsTitle",
    ()=>DocsTitle,
    "EditOnGitHub",
    ()=>EditOnGitHub,
    "page_exports",
    ()=>page_exports
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$fumadocs$2d$ui$2f$dist$2f$_virtual$2f$_rolldown$2f$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/gitRepo/dashboard/docs/node_modules/fumadocs-ui/dist/_virtual/_rolldown/runtime.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$fumadocs$2d$ui$2f$dist$2f$contexts$2f$i18n$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/gitRepo/dashboard/docs/node_modules/fumadocs-ui/dist/contexts/i18n.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$fumadocs$2d$ui$2f$dist$2f$utils$2f$cn$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$locals$3e$__ = __turbopack_context__.i("[project]/gitRepo/dashboard/docs/node_modules/fumadocs-ui/dist/utils/cn.js [app-client] (ecmascript) <locals>");
var __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$tailwind$2d$merge$2f$dist$2f$bundle$2d$mjs$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__twMerge__as__cn$3e$__ = __turbopack_context__.i("[project]/gitRepo/dashboard/docs/node_modules/tailwind-merge/dist/bundle-mjs.mjs [app-client] (ecmascript) <export twMerge as cn>");
var __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$fumadocs$2d$ui$2f$dist$2f$components$2f$ui$2f$button$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/gitRepo/dashboard/docs/node_modules/fumadocs-ui/dist/components/ui/button.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$fumadocs$2d$ui$2f$dist$2f$components$2f$toc$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/gitRepo/dashboard/docs/node_modules/fumadocs-ui/dist/components/toc/index.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$fumadocs$2d$ui$2f$dist$2f$layouts$2f$docs$2f$page$2f$client$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/gitRepo/dashboard/docs/node_modules/fumadocs-ui/dist/layouts/docs/page/client.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$fumadocs$2d$ui$2f$dist$2f$components$2f$toc$2f$default$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/gitRepo/dashboard/docs/node_modules/fumadocs-ui/dist/components/toc/default.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$fumadocs$2d$ui$2f$dist$2f$components$2f$toc$2f$clerk$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/gitRepo/dashboard/docs/node_modules/fumadocs-ui/dist/components/toc/clerk.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/gitRepo/dashboard/docs/node_modules/next/dist/compiled/react/jsx-runtime.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$fumadocs$2d$ui$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$square$2d$pen$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Edit$3e$__ = __turbopack_context__.i("[project]/gitRepo/dashboard/docs/node_modules/fumadocs-ui/node_modules/lucide-react/dist/esm/icons/square-pen.js [app-client] (ecmascript) <export default as Edit>");
var __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$fumadocs$2d$ui$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$text$2d$align$2d$start$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Text$3e$__ = __turbopack_context__.i("[project]/gitRepo/dashboard/docs/node_modules/fumadocs-ui/node_modules/lucide-react/dist/esm/icons/text-align-start.js [app-client] (ecmascript) <export default as Text>");
;
;
;
;
;
;
;
;
;
;
//#region src/layouts/docs/page/index.tsx
var page_exports = /* @__PURE__ */ (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$fumadocs$2d$ui$2f$dist$2f$_virtual$2f$_rolldown$2f$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["__exportAll"])({
    DocsBody: ()=>DocsBody,
    DocsDescription: ()=>DocsDescription,
    DocsPage: ()=>DocsPage,
    DocsTitle: ()=>DocsTitle,
    EditOnGitHub: ()=>EditOnGitHub,
    PageBreadcrumb: ()=>__TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$fumadocs$2d$ui$2f$dist$2f$layouts$2f$docs$2f$page$2f$client$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["PageBreadcrumb"],
    PageLastUpdate: ()=>__TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$fumadocs$2d$ui$2f$dist$2f$layouts$2f$docs$2f$page$2f$client$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["PageLastUpdate"]
});
function DocsPage({ breadcrumb: { enabled: breadcrumbEnabled = true, component: breadcrumb, ...breadcrumbProps } = {}, footer: { enabled: footerEnabled, component: footerReplace, ...footerProps } = {}, full = false, tableOfContentPopover: { enabled: tocPopoverEnabled, component: tocPopover, ...tocPopoverOptions } = {}, tableOfContent: { enabled: tocEnabled, component: tocReplace, ...tocOptions } = {}, toc = [], children, className }) {
    tocEnabled ??= !full && (toc.length > 0 || tocOptions.footer !== void 0 || tocOptions.header !== void 0);
    tocPopoverEnabled ??= toc.length > 0 || tocPopoverOptions.header !== void 0 || tocPopoverOptions.footer !== void 0;
    let wrapper = (children)=>children;
    if (tocEnabled || tocPopoverEnabled) wrapper = (children)=>/* @__PURE__ */ (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsx"])(__TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$fumadocs$2d$ui$2f$dist$2f$components$2f$toc$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["TOCProvider"], {
            single: tocOptions.single,
            toc,
            children
        });
    return wrapper(/* @__PURE__ */ (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxs"])(__TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Fragment"], {
        children: [
            tocPopoverEnabled && (tocPopover ?? /* @__PURE__ */ (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxs"])(__TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$fumadocs$2d$ui$2f$dist$2f$layouts$2f$docs$2f$page$2f$client$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["PageTOCPopover"], {
                children: [
                    /* @__PURE__ */ (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsx"])(__TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$fumadocs$2d$ui$2f$dist$2f$layouts$2f$docs$2f$page$2f$client$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["PageTOCPopoverTrigger"], {}),
                    /* @__PURE__ */ (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxs"])(__TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$fumadocs$2d$ui$2f$dist$2f$layouts$2f$docs$2f$page$2f$client$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["PageTOCPopoverContent"], {
                        children: [
                            tocPopoverOptions.header,
                            /* @__PURE__ */ (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsx"])(__TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$fumadocs$2d$ui$2f$dist$2f$components$2f$toc$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["TOCScrollArea"], {
                                children: tocPopoverOptions.style === "clerk" ? /* @__PURE__ */ (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsx"])(__TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$fumadocs$2d$ui$2f$dist$2f$components$2f$toc$2f$clerk$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["TOCItems"], {}) : /* @__PURE__ */ (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsx"])(__TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$fumadocs$2d$ui$2f$dist$2f$components$2f$toc$2f$default$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["TOCItems"], {})
                            }),
                            tocPopoverOptions.footer
                        ]
                    })
                ]
            })),
            /* @__PURE__ */ (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxs"])("article", {
                id: "nd-page",
                "data-full": full,
                className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$tailwind$2d$merge$2f$dist$2f$bundle$2d$mjs$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__twMerge__as__cn$3e$__["cn"])("flex flex-col w-full max-w-[900px] mx-auto [grid-area:main] px-4 py-6 gap-4 md:px-6 md:pt-8 xl:px-8 xl:pt-14", full ? "max-w-[1168px]" : "xl:layout:[--fd-toc-width:268px]", className),
                children: [
                    breadcrumbEnabled && (breadcrumb ?? /* @__PURE__ */ (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsx"])(__TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$fumadocs$2d$ui$2f$dist$2f$layouts$2f$docs$2f$page$2f$client$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["PageBreadcrumb"], {
                        ...breadcrumbProps
                    })),
                    children,
                    footerEnabled !== false && (footerReplace ?? /* @__PURE__ */ (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsx"])(__TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$fumadocs$2d$ui$2f$dist$2f$layouts$2f$docs$2f$page$2f$client$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["PageFooter"], {
                        ...footerProps
                    }))
                ]
            }),
            tocEnabled && (tocReplace ?? /* @__PURE__ */ (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxs"])("div", {
                id: "nd-toc",
                className: "sticky top-(--fd-docs-row-1) h-[calc(var(--fd-docs-height)-var(--fd-docs-row-1))] flex flex-col [grid-area:toc] w-(--fd-toc-width) pt-12 pe-4 pb-2 max-xl:hidden",
                children: [
                    tocOptions.header,
                    /* @__PURE__ */ (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxs"])("h3", {
                        id: "toc-title",
                        className: "inline-flex items-center gap-1.5 text-sm text-fd-muted-foreground",
                        children: [
                            /* @__PURE__ */ (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsx"])(__TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$fumadocs$2d$ui$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$text$2d$align$2d$start$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Text$3e$__["Text"], {
                                className: "size-4"
                            }),
                            /* @__PURE__ */ (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsx"])(__TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$fumadocs$2d$ui$2f$dist$2f$contexts$2f$i18n$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["I18nLabel"], {
                                label: "toc"
                            })
                        ]
                    }),
                    /* @__PURE__ */ (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsx"])(__TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$fumadocs$2d$ui$2f$dist$2f$components$2f$toc$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["TOCScrollArea"], {
                        children: tocOptions.style === "clerk" ? /* @__PURE__ */ (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsx"])(__TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$fumadocs$2d$ui$2f$dist$2f$components$2f$toc$2f$clerk$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["TOCItems"], {}) : /* @__PURE__ */ (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsx"])(__TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$fumadocs$2d$ui$2f$dist$2f$components$2f$toc$2f$default$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["TOCItems"], {})
                    }),
                    tocOptions.footer
                ]
            }))
        ]
    }));
}
function EditOnGitHub(props) {
    return /* @__PURE__ */ (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsx"])("a", {
        target: "_blank",
        rel: "noreferrer noopener",
        ...props,
        className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$tailwind$2d$merge$2f$dist$2f$bundle$2d$mjs$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__twMerge__as__cn$3e$__["cn"])((0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$fumadocs$2d$ui$2f$dist$2f$components$2f$ui$2f$button$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["buttonVariants"])({
            color: "secondary",
            size: "sm",
            className: "gap-1.5 not-prose"
        }), props.className),
        children: props.children ?? /* @__PURE__ */ (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxs"])(__TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Fragment"], {
            children: [
                /* @__PURE__ */ (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsx"])(__TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$fumadocs$2d$ui$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$square$2d$pen$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Edit$3e$__["Edit"], {
                    className: "size-3.5"
                }),
                /* @__PURE__ */ (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsx"])(__TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$fumadocs$2d$ui$2f$dist$2f$contexts$2f$i18n$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["I18nLabel"], {
                    label: "editOnGithub"
                })
            ]
        })
    });
}
/**
* Add typography styles
*/ function DocsBody({ children, className, ...props }) {
    return /* @__PURE__ */ (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsx"])("div", {
        ...props,
        className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$tailwind$2d$merge$2f$dist$2f$bundle$2d$mjs$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__twMerge__as__cn$3e$__["cn"])("prose flex-1", className),
        children
    });
}
function DocsDescription({ children, className, ...props }) {
    if (children === void 0) return null;
    return /* @__PURE__ */ (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsx"])("p", {
        ...props,
        className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$tailwind$2d$merge$2f$dist$2f$bundle$2d$mjs$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__twMerge__as__cn$3e$__["cn"])("mb-8 text-lg text-fd-muted-foreground", className),
        children
    });
}
function DocsTitle({ children, className, ...props }) {
    return /* @__PURE__ */ (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsx"])("h1", {
        ...props,
        className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$tailwind$2d$merge$2f$dist$2f$bundle$2d$mjs$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__twMerge__as__cn$3e$__["cn"])("text-[1.75em] font-semibold", className),
        children
    });
}
;
}),
"[project]/gitRepo/dashboard/docs/node_modules/fumadocs-ui/dist/layouts/notebook/client.js [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "LayoutBody",
    ()=>LayoutBody,
    "LayoutContext",
    ()=>LayoutContext,
    "LayoutContextProvider",
    ()=>LayoutContextProvider,
    "LayoutHeader",
    ()=>LayoutHeader,
    "LayoutHeaderTabs",
    ()=>LayoutHeaderTabs,
    "NavbarLinkItem",
    ()=>NavbarLinkItem
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$fumadocs$2d$ui$2f$dist$2f$utils$2f$cn$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$locals$3e$__ = __turbopack_context__.i("[project]/gitRepo/dashboard/docs/node_modules/fumadocs-ui/dist/utils/cn.js [app-client] (ecmascript) <locals>");
var __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$tailwind$2d$merge$2f$dist$2f$bundle$2d$mjs$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__twMerge__as__cn$3e$__ = __turbopack_context__.i("[project]/gitRepo/dashboard/docs/node_modules/tailwind-merge/dist/bundle-mjs.mjs [app-client] (ecmascript) <export twMerge as cn>");
var __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$fumadocs$2d$ui$2f$dist$2f$components$2f$sidebar$2f$base$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/gitRepo/dashboard/docs/node_modules/fumadocs-ui/dist/components/sidebar/base.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$fumadocs$2d$ui$2f$dist$2f$components$2f$ui$2f$popover$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/gitRepo/dashboard/docs/node_modules/fumadocs-ui/dist/components/ui/popover.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$fumadocs$2d$ui$2f$dist$2f$components$2f$sidebar$2f$tabs$2f$dropdown$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/gitRepo/dashboard/docs/node_modules/fumadocs-ui/dist/components/sidebar/tabs/dropdown.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$fumadocs$2d$ui$2f$dist$2f$utils$2f$use$2d$is$2d$scroll$2d$top$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/gitRepo/dashboard/docs/node_modules/fumadocs-ui/dist/utils/use-is-scroll-top.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$fumadocs$2d$ui$2f$dist$2f$utils$2f$link$2d$item$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/gitRepo/dashboard/docs/node_modules/fumadocs-ui/dist/utils/link-item.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/gitRepo/dashboard/docs/node_modules/next/dist/compiled/react/index.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$fumadocs$2d$core$2f$dist$2f$framework$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/gitRepo/dashboard/docs/node_modules/fumadocs-core/dist/framework/index.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/gitRepo/dashboard/docs/node_modules/next/dist/compiled/react/jsx-runtime.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$fumadocs$2d$core$2f$dist$2f$link$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/gitRepo/dashboard/docs/node_modules/fumadocs-core/dist/link.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$fumadocs$2d$ui$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$chevron$2d$down$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__ChevronDown$3e$__ = __turbopack_context__.i("[project]/gitRepo/dashboard/docs/node_modules/fumadocs-ui/node_modules/lucide-react/dist/esm/icons/chevron-down.js [app-client] (ecmascript) <export default as ChevronDown>");
'use client';
;
;
;
;
;
;
;
;
;
;
;
//#region src/layouts/notebook/client.tsx
const LayoutContext = (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["createContext"])(null);
function LayoutContextProvider({ navTransparentMode = "none", navMode, tabMode, children }) {
    const isTop = (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$fumadocs$2d$ui$2f$dist$2f$utils$2f$use$2d$is$2d$scroll$2d$top$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useIsScrollTop"])({
        enabled: navTransparentMode === "top"
    }) ?? true;
    const isNavTransparent = navTransparentMode === "top" ? isTop : navTransparentMode === "always";
    return /* @__PURE__ */ (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsx"])(LayoutContext, {
        value: (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useMemo"])({
            "LayoutContextProvider.useMemo": ()=>({
                    isNavTransparent,
                    navMode,
                    tabMode
                })
        }["LayoutContextProvider.useMemo"], [
            isNavTransparent,
            navMode,
            tabMode
        ]),
        children
    });
}
function LayoutHeader(props) {
    const { open } = (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$fumadocs$2d$ui$2f$dist$2f$components$2f$sidebar$2f$base$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useSidebar"])();
    const { isNavTransparent } = (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["use"])(LayoutContext);
    return /* @__PURE__ */ (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsx"])("header", {
        "data-transparent": isNavTransparent && !open,
        ...props,
        children: props.children
    });
}
function LayoutBody({ className, style, children, ...props }) {
    const { navMode } = (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["use"])(LayoutContext);
    const { collapsed } = (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$fumadocs$2d$ui$2f$dist$2f$components$2f$sidebar$2f$base$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useSidebar"])();
    const pageCol = "calc(var(--fd-layout-width,97rem) - var(--fd-sidebar-col) - var(--fd-toc-width))";
    return /* @__PURE__ */ (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsx"])("div", {
        id: "nd-notebook-layout",
        className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$tailwind$2d$merge$2f$dist$2f$bundle$2d$mjs$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__twMerge__as__cn$3e$__["cn"])("grid overflow-x-clip min-h-(--fd-docs-height) transition-[grid-template-columns] auto-cols-auto auto-rows-auto [--fd-docs-height:100dvh] [--fd-header-height:0px] [--fd-toc-popover-height:0px] [--fd-sidebar-width:0px] [--fd-toc-width:0px]", className),
        style: {
            gridTemplate: navMode === "top" ? `". header header header ."
        "sidebar sidebar toc-popover toc-popover ."
        "sidebar sidebar main toc ." 1fr / minmax(min-content, 1fr) var(--fd-sidebar-col) minmax(0, ${pageCol}) var(--fd-toc-width) minmax(min-content, 1fr)` : `"sidebar sidebar header header ."
        "sidebar sidebar toc-popover toc-popover ."
        "sidebar sidebar main toc ." 1fr / minmax(min-content, 1fr) var(--fd-sidebar-col) minmax(0, ${pageCol}) var(--fd-toc-width) minmax(min-content, 1fr)`,
            "--fd-docs-row-1": "var(--fd-banner-height, 0px)",
            "--fd-docs-row-2": "calc(var(--fd-docs-row-1) + var(--fd-header-height))",
            "--fd-docs-row-3": "calc(var(--fd-docs-row-2) + var(--fd-toc-popover-height))",
            "--fd-sidebar-col": collapsed ? "0px" : "var(--fd-sidebar-width)",
            ...style
        },
        ...props,
        children
    });
}
function LayoutHeaderTabs({ options, className, ...props }) {
    const pathname = (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$fumadocs$2d$core$2f$dist$2f$framework$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["usePathname"])();
    const selectedIdx = (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useMemo"])({
        "LayoutHeaderTabs.useMemo[selectedIdx]": ()=>{
            return options.findLastIndex({
                "LayoutHeaderTabs.useMemo[selectedIdx]": (option)=>(0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$fumadocs$2d$ui$2f$dist$2f$components$2f$sidebar$2f$tabs$2f$dropdown$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["isTabActive"])(option, pathname)
            }["LayoutHeaderTabs.useMemo[selectedIdx]"]);
        }
    }["LayoutHeaderTabs.useMemo[selectedIdx]"], [
        options,
        pathname
    ]);
    return /* @__PURE__ */ (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsx"])("div", {
        className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$tailwind$2d$merge$2f$dist$2f$bundle$2d$mjs$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__twMerge__as__cn$3e$__["cn"])("flex flex-row items-end gap-6", className),
        ...props,
        children: options.map((option, i)=>{
            const { title, url, unlisted, props: { className, ...rest } = {} } = option;
            const isSelected = selectedIdx === i;
            return /* @__PURE__ */ (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsx"])(__TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$fumadocs$2d$core$2f$dist$2f$link$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"], {
                href: url,
                className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$tailwind$2d$merge$2f$dist$2f$bundle$2d$mjs$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__twMerge__as__cn$3e$__["cn"])("inline-flex border-b-2 border-transparent transition-colors items-center pb-1.5 font-medium gap-2 text-fd-muted-foreground text-sm text-nowrap hover:text-fd-accent-foreground", unlisted && !isSelected && "hidden", isSelected && "border-fd-primary text-fd-primary", className),
                ...rest,
                children: title
            }, i);
        })
    });
}
function NavbarLinkItem({ item, className, ...props }) {
    if (item.type === "custom") return item.children;
    if (item.type === "menu") return /* @__PURE__ */ (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsx"])(NavbarLinkItemMenu, {
        item,
        className,
        ...props
    });
    return /* @__PURE__ */ (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsx"])(__TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$fumadocs$2d$ui$2f$dist$2f$utils$2f$link$2d$item$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["LinkItem"], {
        item,
        className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$tailwind$2d$merge$2f$dist$2f$bundle$2d$mjs$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__twMerge__as__cn$3e$__["cn"])("text-sm text-fd-muted-foreground transition-colors hover:text-fd-accent-foreground data-[active=true]:text-fd-primary", className),
        ...props,
        children: item.text
    });
}
function NavbarLinkItemMenu({ item, hoverDelay = 50, className, ...props }) {
    const [open, setOpen] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(false);
    const timeoutRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useRef"])(null);
    const freezeUntil = (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useRef"])(null);
    const delaySetOpen = (value)=>{
        if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
            timeoutRef.current = null;
        }
        timeoutRef.current = window.setTimeout(()=>{
            setOpen(value);
            freezeUntil.current = Date.now() + 300;
        }, hoverDelay);
    };
    const onPointerEnter = (e)=>{
        if (e.pointerType === "touch") return;
        delaySetOpen(true);
    };
    const onPointerLeave = (e)=>{
        if (e.pointerType === "touch") return;
        delaySetOpen(false);
    };
    function isTouchDevice() {
        return "ontouchstart" in window || navigator.maxTouchPoints > 0;
    }
    return /* @__PURE__ */ (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxs"])(__TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$fumadocs$2d$ui$2f$dist$2f$components$2f$ui$2f$popover$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Popover"], {
        open,
        onOpenChange: (value)=>{
            if (freezeUntil.current === null || Date.now() >= freezeUntil.current) setOpen(value);
        },
        children: [
            /* @__PURE__ */ (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxs"])(__TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$fumadocs$2d$ui$2f$dist$2f$components$2f$ui$2f$popover$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["PopoverTrigger"], {
                className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$tailwind$2d$merge$2f$dist$2f$bundle$2d$mjs$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__twMerge__as__cn$3e$__["cn"])("inline-flex items-center gap-1.5 p-1 text-sm text-fd-muted-foreground transition-colors has-data-[active=true]:text-fd-primary data-[state=open]:text-fd-accent-foreground focus-visible:outline-none", className),
                onPointerEnter,
                onPointerLeave,
                ...props,
                children: [
                    item.url ? /* @__PURE__ */ (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsx"])(__TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$fumadocs$2d$ui$2f$dist$2f$utils$2f$link$2d$item$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["LinkItem"], {
                        item,
                        children: item.text
                    }) : item.text,
                    /* @__PURE__ */ (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsx"])(__TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$fumadocs$2d$ui$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$chevron$2d$down$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__ChevronDown$3e$__["ChevronDown"], {
                        className: "size-3"
                    })
                ]
            }),
            /* @__PURE__ */ (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsx"])(__TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$fumadocs$2d$ui$2f$dist$2f$components$2f$ui$2f$popover$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["PopoverContent"], {
                className: "flex flex-col p-1 text-fd-muted-foreground text-start",
                onPointerEnter,
                onPointerLeave,
                children: item.items.map((child, i)=>{
                    if (child.type === "custom") return /* @__PURE__ */ (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsx"])(__TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Fragment"], {
                        children: child.children
                    }, i);
                    return /* @__PURE__ */ (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxs"])(__TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$fumadocs$2d$ui$2f$dist$2f$utils$2f$link$2d$item$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["LinkItem"], {
                        item: child,
                        className: "inline-flex items-center gap-2 rounded-md p-2 transition-colors hover:bg-fd-accent hover:text-fd-accent-foreground data-[active=true]:text-fd-primary [&_svg]:size-4",
                        onClick: ()=>{
                            if (isTouchDevice()) setOpen(false);
                        },
                        children: [
                            child.icon,
                            child.text
                        ]
                    }, i);
                })
            })
        ]
    });
}
;
}),
"[project]/gitRepo/dashboard/docs/node_modules/fumadocs-ui/dist/layouts/notebook/page/client.js [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "PageBreadcrumb",
    ()=>PageBreadcrumb,
    "PageFooter",
    ()=>PageFooter,
    "PageLastUpdate",
    ()=>PageLastUpdate,
    "PageTOCPopover",
    ()=>PageTOCPopover,
    "PageTOCPopoverContent",
    ()=>PageTOCPopoverContent,
    "PageTOCPopoverTrigger",
    ()=>PageTOCPopoverTrigger
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$fumadocs$2d$ui$2f$dist$2f$contexts$2f$i18n$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/gitRepo/dashboard/docs/node_modules/fumadocs-ui/dist/contexts/i18n.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$fumadocs$2d$ui$2f$dist$2f$utils$2f$cn$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$locals$3e$__ = __turbopack_context__.i("[project]/gitRepo/dashboard/docs/node_modules/fumadocs-ui/dist/utils/cn.js [app-client] (ecmascript) <locals>");
var __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$tailwind$2d$merge$2f$dist$2f$bundle$2d$mjs$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__twMerge__as__cn$3e$__ = __turbopack_context__.i("[project]/gitRepo/dashboard/docs/node_modules/tailwind-merge/dist/bundle-mjs.mjs [app-client] (ecmascript) <export twMerge as cn>");
var __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$fumadocs$2d$ui$2f$dist$2f$contexts$2f$tree$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/gitRepo/dashboard/docs/node_modules/fumadocs-ui/dist/contexts/tree.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$fumadocs$2d$ui$2f$dist$2f$utils$2f$urls$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/gitRepo/dashboard/docs/node_modules/fumadocs-ui/dist/utils/urls.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$fumadocs$2d$ui$2f$dist$2f$components$2f$ui$2f$collapsible$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/gitRepo/dashboard/docs/node_modules/fumadocs-ui/dist/components/ui/collapsible.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$fumadocs$2d$ui$2f$dist$2f$components$2f$toc$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/gitRepo/dashboard/docs/node_modules/fumadocs-ui/dist/components/toc/index.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$fumadocs$2d$ui$2f$dist$2f$utils$2f$use$2d$footer$2d$items$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/gitRepo/dashboard/docs/node_modules/fumadocs-ui/dist/utils/use-footer-items.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$fumadocs$2d$ui$2f$dist$2f$layouts$2f$notebook$2f$client$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/gitRepo/dashboard/docs/node_modules/fumadocs-ui/dist/layouts/notebook/client.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/gitRepo/dashboard/docs/node_modules/next/dist/compiled/react/index.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$fumadocs$2d$core$2f$dist$2f$framework$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/gitRepo/dashboard/docs/node_modules/fumadocs-core/dist/framework/index.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/gitRepo/dashboard/docs/node_modules/next/dist/compiled/react/jsx-runtime.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$fumadocs$2d$core$2f$dist$2f$link$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/gitRepo/dashboard/docs/node_modules/fumadocs-core/dist/link.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$fumadocs$2d$ui$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$chevron$2d$down$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__ChevronDown$3e$__ = __turbopack_context__.i("[project]/gitRepo/dashboard/docs/node_modules/fumadocs-ui/node_modules/lucide-react/dist/esm/icons/chevron-down.js [app-client] (ecmascript) <export default as ChevronDown>");
var __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$fumadocs$2d$ui$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$chevron$2d$left$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__ChevronLeft$3e$__ = __turbopack_context__.i("[project]/gitRepo/dashboard/docs/node_modules/fumadocs-ui/node_modules/lucide-react/dist/esm/icons/chevron-left.js [app-client] (ecmascript) <export default as ChevronLeft>");
var __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$fumadocs$2d$ui$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$chevron$2d$right$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__ChevronRight$3e$__ = __turbopack_context__.i("[project]/gitRepo/dashboard/docs/node_modules/fumadocs-ui/node_modules/lucide-react/dist/esm/icons/chevron-right.js [app-client] (ecmascript) <export default as ChevronRight>");
var __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$fumadocs$2d$core$2f$dist$2f$breadcrumb$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/gitRepo/dashboard/docs/node_modules/fumadocs-core/dist/breadcrumb.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$fumadocs$2d$core$2f$dist$2f$toc$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/gitRepo/dashboard/docs/node_modules/fumadocs-core/dist/toc.js [app-client] (ecmascript)");
'use client';
;
;
;
;
;
;
;
;
;
;
;
;
;
;
;
//#region src/layouts/notebook/page/client.tsx
const TocPopoverContext = (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["createContext"])(null);
function PageTOCPopover({ className, children, ...rest }) {
    const ref = (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useRef"])(null);
    const [open, setOpen] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(false);
    const { isNavTransparent } = (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["use"])(__TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$fumadocs$2d$ui$2f$dist$2f$layouts$2f$notebook$2f$client$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["LayoutContext"]);
    const onClick = (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useEffectEvent"])({
        "PageTOCPopover.useEffectEvent[onClick]": (e)=>{
            if (!open) return;
            if (ref.current && !ref.current.contains(e.target)) setOpen(false);
        }
    }["PageTOCPopover.useEffectEvent[onClick]"]);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useEffect"])({
        "PageTOCPopover.useEffect": ()=>{
            window.addEventListener("click", onClick);
            return ({
                "PageTOCPopover.useEffect": ()=>{
                    window.removeEventListener("click", onClick);
                }
            })["PageTOCPopover.useEffect"];
        }
    }["PageTOCPopover.useEffect"], []);
    return /* @__PURE__ */ (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsx"])(TocPopoverContext, {
        value: (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useMemo"])({
            "PageTOCPopover.useMemo": ()=>({
                    open,
                    setOpen
                })
        }["PageTOCPopover.useMemo"], [
            setOpen,
            open
        ]),
        children: /* @__PURE__ */ (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsx"])(__TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$fumadocs$2d$ui$2f$dist$2f$components$2f$ui$2f$collapsible$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Collapsible"], {
            open,
            onOpenChange: setOpen,
            "data-toc-popover": "",
            className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$tailwind$2d$merge$2f$dist$2f$bundle$2d$mjs$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__twMerge__as__cn$3e$__["cn"])("sticky top-(--fd-docs-row-2) z-10 [grid-area:toc-popover] h-(--fd-toc-popover-height) xl:hidden max-xl:layout:[--fd-toc-popover-height:--spacing(10)]", className),
            ...rest,
            children: /* @__PURE__ */ (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsx"])("header", {
                ref,
                className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$tailwind$2d$merge$2f$dist$2f$bundle$2d$mjs$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__twMerge__as__cn$3e$__["cn"])("border-b backdrop-blur-sm transition-colors", (!isNavTransparent || open) && "bg-fd-background/80", open && "shadow-lg"),
                children
            })
        })
    });
}
function PageTOCPopoverTrigger({ className, ...props }) {
    const { text } = (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$fumadocs$2d$ui$2f$dist$2f$contexts$2f$i18n$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useI18n"])();
    const { open } = (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["use"])(TocPopoverContext);
    const items = (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$fumadocs$2d$ui$2f$dist$2f$components$2f$toc$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useTOCItems"])();
    const active = (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$fumadocs$2d$core$2f$dist$2f$toc$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useActiveAnchor"])();
    const selected = (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useMemo"])({
        "PageTOCPopoverTrigger.useMemo[selected]": ()=>items.findIndex({
                "PageTOCPopoverTrigger.useMemo[selected]": (item)=>active === item.url.slice(1)
            }["PageTOCPopoverTrigger.useMemo[selected]"])
    }["PageTOCPopoverTrigger.useMemo[selected]"], [
        items,
        active
    ]);
    const path = (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$fumadocs$2d$ui$2f$dist$2f$contexts$2f$tree$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useTreePath"])().at(-1);
    const showItem = selected !== -1 && !open;
    return /* @__PURE__ */ (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxs"])(__TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$fumadocs$2d$ui$2f$dist$2f$components$2f$ui$2f$collapsible$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["CollapsibleTrigger"], {
        className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$tailwind$2d$merge$2f$dist$2f$bundle$2d$mjs$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__twMerge__as__cn$3e$__["cn"])("flex w-full h-10 items-center text-sm text-fd-muted-foreground gap-2.5 px-4 py-2.5 text-start focus-visible:outline-none [&_svg]:size-4 md:px-6", className),
        "data-toc-popover-trigger": "",
        ...props,
        children: [
            /* @__PURE__ */ (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsx"])(ProgressCircle, {
                value: (selected + 1) / Math.max(1, items.length),
                max: 1,
                className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$tailwind$2d$merge$2f$dist$2f$bundle$2d$mjs$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__twMerge__as__cn$3e$__["cn"])("shrink-0", open && "text-fd-primary")
            }),
            /* @__PURE__ */ (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxs"])("span", {
                className: "grid flex-1 *:my-auto *:row-start-1 *:col-start-1",
                children: [
                    /* @__PURE__ */ (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsx"])("span", {
                        className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$tailwind$2d$merge$2f$dist$2f$bundle$2d$mjs$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__twMerge__as__cn$3e$__["cn"])("truncate transition-[opacity,translate,color]", open && "text-fd-foreground", showItem && "opacity-0 -translate-y-full pointer-events-none"),
                        children: path?.name ?? text.toc
                    }),
                    /* @__PURE__ */ (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsx"])("span", {
                        className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$tailwind$2d$merge$2f$dist$2f$bundle$2d$mjs$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__twMerge__as__cn$3e$__["cn"])("truncate transition-[opacity,translate]", !showItem && "opacity-0 translate-y-full pointer-events-none"),
                        children: items[selected]?.title
                    })
                ]
            }),
            /* @__PURE__ */ (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsx"])(__TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$fumadocs$2d$ui$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$chevron$2d$down$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__ChevronDown$3e$__["ChevronDown"], {
                className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$tailwind$2d$merge$2f$dist$2f$bundle$2d$mjs$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__twMerge__as__cn$3e$__["cn"])("shrink-0 transition-transform mx-0.5", open && "rotate-180")
            })
        ]
    });
}
function clamp(input, min, max) {
    if (input < min) return min;
    if (input > max) return max;
    return input;
}
function ProgressCircle({ value, strokeWidth = 2, size = 24, min = 0, max = 100, ...restSvgProps }) {
    const normalizedValue = clamp(value, min, max);
    const radius = (size - strokeWidth) / 2;
    const circumference = 2 * Math.PI * radius;
    const progress = normalizedValue / max * circumference;
    const circleProps = {
        cx: size / 2,
        cy: size / 2,
        r: radius,
        fill: "none",
        strokeWidth
    };
    return /* @__PURE__ */ (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxs"])("svg", {
        role: "progressbar",
        viewBox: `0 0 ${size} ${size}`,
        "aria-valuenow": normalizedValue,
        "aria-valuemin": min,
        "aria-valuemax": max,
        ...restSvgProps,
        children: [
            /* @__PURE__ */ (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsx"])("circle", {
                ...circleProps,
                className: "stroke-current/25"
            }),
            /* @__PURE__ */ (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsx"])("circle", {
                ...circleProps,
                stroke: "currentColor",
                strokeDasharray: circumference,
                strokeDashoffset: circumference - progress,
                strokeLinecap: "round",
                transform: `rotate(-90 ${size / 2} ${size / 2})`,
                className: "transition-all"
            })
        ]
    });
}
function PageTOCPopoverContent(props) {
    return /* @__PURE__ */ (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsx"])(__TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$fumadocs$2d$ui$2f$dist$2f$components$2f$ui$2f$collapsible$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["CollapsibleContent"], {
        "data-toc-popover-content": "",
        ...props,
        className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$tailwind$2d$merge$2f$dist$2f$bundle$2d$mjs$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__twMerge__as__cn$3e$__["cn"])("flex flex-col px-4 max-h-[50vh] md:px-6", props.className),
        children: props.children
    });
}
function PageLastUpdate({ date: value, ...props }) {
    const { text } = (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$fumadocs$2d$ui$2f$dist$2f$contexts$2f$i18n$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useI18n"])();
    const [date, setDate] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])("");
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useEffect"])({
        "PageLastUpdate.useEffect": ()=>{
            setDate(value.toLocaleDateString());
        }
    }["PageLastUpdate.useEffect"], [
        value
    ]);
    return /* @__PURE__ */ (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxs"])("p", {
        ...props,
        className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$tailwind$2d$merge$2f$dist$2f$bundle$2d$mjs$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__twMerge__as__cn$3e$__["cn"])("text-sm text-fd-muted-foreground", props.className),
        children: [
            text.lastUpdate,
            " ",
            date
        ]
    });
}
function PageFooter({ items, children, className, ...props }) {
    const footerList = (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$fumadocs$2d$ui$2f$dist$2f$utils$2f$use$2d$footer$2d$items$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useFooterItems"])();
    const pathname = (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$fumadocs$2d$core$2f$dist$2f$framework$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["usePathname"])();
    const { previous, next } = (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useMemo"])({
        "PageFooter.useMemo": ()=>{
            if (items) return items;
            const idx = footerList.findIndex({
                "PageFooter.useMemo.idx": (item)=>(0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$fumadocs$2d$ui$2f$dist$2f$utils$2f$urls$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["isActive"])(item.url, pathname)
            }["PageFooter.useMemo.idx"]);
            if (idx === -1) return {};
            return {
                previous: footerList[idx - 1],
                next: footerList[idx + 1]
            };
        }
    }["PageFooter.useMemo"], [
        footerList,
        items,
        pathname
    ]);
    return /* @__PURE__ */ (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxs"])(__TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Fragment"], {
        children: [
            /* @__PURE__ */ (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxs"])("div", {
                className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$tailwind$2d$merge$2f$dist$2f$bundle$2d$mjs$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__twMerge__as__cn$3e$__["cn"])("@container grid gap-4", previous && next ? "grid-cols-2" : "grid-cols-1", className),
                ...props,
                children: [
                    previous && /* @__PURE__ */ (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsx"])(FooterItem, {
                        item: previous,
                        index: 0
                    }),
                    next && /* @__PURE__ */ (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsx"])(FooterItem, {
                        item: next,
                        index: 1
                    })
                ]
            }),
            children
        ]
    });
}
function FooterItem({ item, index }) {
    const { text } = (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$fumadocs$2d$ui$2f$dist$2f$contexts$2f$i18n$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useI18n"])();
    const Icon = index === 0 ? __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$fumadocs$2d$ui$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$chevron$2d$left$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__ChevronLeft$3e$__["ChevronLeft"] : __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$fumadocs$2d$ui$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$chevron$2d$right$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__ChevronRight$3e$__["ChevronRight"];
    return /* @__PURE__ */ (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxs"])(__TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$fumadocs$2d$core$2f$dist$2f$link$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"], {
        href: item.url,
        className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$tailwind$2d$merge$2f$dist$2f$bundle$2d$mjs$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__twMerge__as__cn$3e$__["cn"])("flex flex-col gap-2 rounded-lg border p-4 text-sm transition-colors hover:bg-fd-accent/80 hover:text-fd-accent-foreground @max-lg:col-span-full", index === 1 && "text-end"),
        children: [
            /* @__PURE__ */ (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxs"])("div", {
                className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$tailwind$2d$merge$2f$dist$2f$bundle$2d$mjs$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__twMerge__as__cn$3e$__["cn"])("inline-flex items-center gap-1.5 font-medium", index === 1 && "flex-row-reverse"),
                children: [
                    /* @__PURE__ */ (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsx"])(Icon, {
                        className: "-mx-1 size-4 shrink-0 rtl:rotate-180"
                    }),
                    /* @__PURE__ */ (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsx"])("p", {
                        children: item.name
                    })
                ]
            }),
            /* @__PURE__ */ (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsx"])("p", {
                className: "text-fd-muted-foreground truncate",
                children: item.description ?? (index === 0 ? text.previousPage : text.nextPage)
            })
        ]
    });
}
function PageBreadcrumb({ includeRoot, includeSeparator, includePage, ...props }) {
    const path = (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$fumadocs$2d$ui$2f$dist$2f$contexts$2f$tree$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useTreePath"])();
    const { root } = (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$fumadocs$2d$ui$2f$dist$2f$contexts$2f$tree$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useTreeContext"])();
    const items = (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useMemo"])({
        "PageBreadcrumb.useMemo[items]": ()=>{
            return (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$fumadocs$2d$core$2f$dist$2f$breadcrumb$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["getBreadcrumbItemsFromPath"])(root, path, {
                includePage,
                includeSeparator,
                includeRoot
            });
        }
    }["PageBreadcrumb.useMemo[items]"], [
        includePage,
        includeRoot,
        includeSeparator,
        path,
        root
    ]);
    if (items.length === 0) return null;
    return /* @__PURE__ */ (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsx"])("div", {
        ...props,
        className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$tailwind$2d$merge$2f$dist$2f$bundle$2d$mjs$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__twMerge__as__cn$3e$__["cn"])("flex items-center gap-1.5 text-sm text-fd-muted-foreground", props.className),
        children: items.map((item, i)=>{
            const className = (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$tailwind$2d$merge$2f$dist$2f$bundle$2d$mjs$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__twMerge__as__cn$3e$__["cn"])("truncate", i === items.length - 1 && "text-fd-primary font-medium");
            return /* @__PURE__ */ (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxs"])(__TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Fragment"], {
                children: [
                    i !== 0 && /* @__PURE__ */ (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsx"])(__TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$fumadocs$2d$ui$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$chevron$2d$right$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__ChevronRight$3e$__["ChevronRight"], {
                        className: "size-3.5 shrink-0"
                    }),
                    item.url ? /* @__PURE__ */ (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsx"])(__TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$fumadocs$2d$core$2f$dist$2f$link$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"], {
                        href: item.url,
                        className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$tailwind$2d$merge$2f$dist$2f$bundle$2d$mjs$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__twMerge__as__cn$3e$__["cn"])(className, "transition-opacity hover:opacity-80"),
                        children: item.name
                    }) : /* @__PURE__ */ (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsx"])("span", {
                        className,
                        children: item.name
                    })
                ]
            }, i);
        })
    });
}
;
}),
"[project]/gitRepo/dashboard/docs/node_modules/fumadocs-ui/dist/layouts/notebook/page/index.js [app-client] (ecmascript) <locals>", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "DocsBody",
    ()=>DocsBody,
    "DocsDescription",
    ()=>DocsDescription,
    "DocsPage",
    ()=>DocsPage,
    "DocsTitle",
    ()=>DocsTitle,
    "EditOnGitHub",
    ()=>EditOnGitHub,
    "page_exports",
    ()=>page_exports
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$fumadocs$2d$ui$2f$dist$2f$_virtual$2f$_rolldown$2f$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/gitRepo/dashboard/docs/node_modules/fumadocs-ui/dist/_virtual/_rolldown/runtime.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$fumadocs$2d$ui$2f$dist$2f$contexts$2f$i18n$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/gitRepo/dashboard/docs/node_modules/fumadocs-ui/dist/contexts/i18n.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$fumadocs$2d$ui$2f$dist$2f$utils$2f$cn$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$locals$3e$__ = __turbopack_context__.i("[project]/gitRepo/dashboard/docs/node_modules/fumadocs-ui/dist/utils/cn.js [app-client] (ecmascript) <locals>");
var __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$tailwind$2d$merge$2f$dist$2f$bundle$2d$mjs$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__twMerge__as__cn$3e$__ = __turbopack_context__.i("[project]/gitRepo/dashboard/docs/node_modules/tailwind-merge/dist/bundle-mjs.mjs [app-client] (ecmascript) <export twMerge as cn>");
var __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$fumadocs$2d$ui$2f$dist$2f$components$2f$ui$2f$button$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/gitRepo/dashboard/docs/node_modules/fumadocs-ui/dist/components/ui/button.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$fumadocs$2d$ui$2f$dist$2f$components$2f$toc$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/gitRepo/dashboard/docs/node_modules/fumadocs-ui/dist/components/toc/index.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$fumadocs$2d$ui$2f$dist$2f$components$2f$toc$2f$default$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/gitRepo/dashboard/docs/node_modules/fumadocs-ui/dist/components/toc/default.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$fumadocs$2d$ui$2f$dist$2f$components$2f$toc$2f$clerk$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/gitRepo/dashboard/docs/node_modules/fumadocs-ui/dist/components/toc/clerk.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$fumadocs$2d$ui$2f$dist$2f$layouts$2f$notebook$2f$page$2f$client$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/gitRepo/dashboard/docs/node_modules/fumadocs-ui/dist/layouts/notebook/page/client.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/gitRepo/dashboard/docs/node_modules/next/dist/compiled/react/jsx-runtime.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$fumadocs$2d$ui$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$square$2d$pen$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Edit$3e$__ = __turbopack_context__.i("[project]/gitRepo/dashboard/docs/node_modules/fumadocs-ui/node_modules/lucide-react/dist/esm/icons/square-pen.js [app-client] (ecmascript) <export default as Edit>");
var __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$fumadocs$2d$ui$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$text$2d$align$2d$start$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Text$3e$__ = __turbopack_context__.i("[project]/gitRepo/dashboard/docs/node_modules/fumadocs-ui/node_modules/lucide-react/dist/esm/icons/text-align-start.js [app-client] (ecmascript) <export default as Text>");
;
;
;
;
;
;
;
;
;
;
//#region src/layouts/notebook/page/index.tsx
var page_exports = /* @__PURE__ */ (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$fumadocs$2d$ui$2f$dist$2f$_virtual$2f$_rolldown$2f$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["__exportAll"])({
    DocsBody: ()=>DocsBody,
    DocsDescription: ()=>DocsDescription,
    DocsPage: ()=>DocsPage,
    DocsTitle: ()=>DocsTitle,
    EditOnGitHub: ()=>EditOnGitHub,
    PageBreadcrumb: ()=>__TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$fumadocs$2d$ui$2f$dist$2f$layouts$2f$notebook$2f$page$2f$client$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["PageBreadcrumb"],
    PageLastUpdate: ()=>__TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$fumadocs$2d$ui$2f$dist$2f$layouts$2f$notebook$2f$page$2f$client$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["PageLastUpdate"]
});
function DocsPage({ breadcrumb: { enabled: breadcrumbEnabled = true, component: breadcrumb, ...breadcrumbProps } = {}, footer: { enabled: footerEnabled, component: footerReplace, ...footerProps } = {}, full = false, tableOfContentPopover: { enabled: tocPopoverEnabled, component: tocPopover, ...tocPopoverOptions } = {}, tableOfContent: { enabled: tocEnabled, component: tocReplace, ...tocOptions } = {}, toc = [], children, className }) {
    tocEnabled ??= !full && (toc.length > 0 || tocOptions.footer !== void 0 || tocOptions.header !== void 0);
    tocPopoverEnabled ??= toc.length > 0 || tocPopoverOptions.header !== void 0 || tocPopoverOptions.footer !== void 0;
    let wrapper = (children)=>children;
    if (tocEnabled || tocPopoverEnabled) wrapper = (children)=>/* @__PURE__ */ (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsx"])(__TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$fumadocs$2d$ui$2f$dist$2f$components$2f$toc$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["TOCProvider"], {
            single: tocOptions.single,
            toc,
            children
        });
    return wrapper(/* @__PURE__ */ (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxs"])(__TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Fragment"], {
        children: [
            tocPopoverEnabled && (tocPopover ?? /* @__PURE__ */ (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxs"])(__TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$fumadocs$2d$ui$2f$dist$2f$layouts$2f$notebook$2f$page$2f$client$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["PageTOCPopover"], {
                children: [
                    /* @__PURE__ */ (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsx"])(__TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$fumadocs$2d$ui$2f$dist$2f$layouts$2f$notebook$2f$page$2f$client$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["PageTOCPopoverTrigger"], {}),
                    /* @__PURE__ */ (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxs"])(__TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$fumadocs$2d$ui$2f$dist$2f$layouts$2f$notebook$2f$page$2f$client$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["PageTOCPopoverContent"], {
                        children: [
                            tocPopoverOptions.header,
                            /* @__PURE__ */ (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsx"])(__TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$fumadocs$2d$ui$2f$dist$2f$components$2f$toc$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["TOCScrollArea"], {
                                children: tocPopoverOptions.style === "clerk" ? /* @__PURE__ */ (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsx"])(__TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$fumadocs$2d$ui$2f$dist$2f$components$2f$toc$2f$clerk$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["TOCItems"], {}) : /* @__PURE__ */ (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsx"])(__TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$fumadocs$2d$ui$2f$dist$2f$components$2f$toc$2f$default$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["TOCItems"], {})
                            }),
                            tocPopoverOptions.footer
                        ]
                    })
                ]
            })),
            /* @__PURE__ */ (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxs"])("article", {
                id: "nd-page",
                "data-full": full,
                className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$tailwind$2d$merge$2f$dist$2f$bundle$2d$mjs$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__twMerge__as__cn$3e$__["cn"])("flex flex-col [grid-area:main] px-4 py-6 gap-4 md:px-6 md:pt-8 xl:px-8 xl:pt-14 *:max-w-[900px]", full && "*:max-w-[1285px]", className),
                children: [
                    breadcrumbEnabled && (breadcrumb ?? /* @__PURE__ */ (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsx"])(__TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$fumadocs$2d$ui$2f$dist$2f$layouts$2f$notebook$2f$page$2f$client$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["PageBreadcrumb"], {
                        ...breadcrumbProps
                    })),
                    children,
                    footerEnabled !== false && (footerReplace ?? /* @__PURE__ */ (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsx"])(__TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$fumadocs$2d$ui$2f$dist$2f$layouts$2f$notebook$2f$page$2f$client$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["PageFooter"], {
                        ...footerProps
                    }))
                ]
            }),
            tocEnabled && (tocReplace ?? /* @__PURE__ */ (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxs"])("div", {
                id: "nd-toc",
                className: "sticky top-(--fd-docs-row-3) [grid-area:toc] h-[calc(var(--fd-docs-height)-var(--fd-docs-row-3))] flex flex-col w-(--fd-toc-width) pt-12 pe-4 pb-2 xl:layout:[--fd-toc-width:268px] max-xl:hidden",
                children: [
                    tocOptions.header,
                    /* @__PURE__ */ (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxs"])("h3", {
                        id: "toc-title",
                        className: "inline-flex items-center gap-1.5 text-sm text-fd-muted-foreground",
                        children: [
                            /* @__PURE__ */ (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsx"])(__TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$fumadocs$2d$ui$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$text$2d$align$2d$start$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Text$3e$__["Text"], {
                                className: "size-4"
                            }),
                            /* @__PURE__ */ (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsx"])(__TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$fumadocs$2d$ui$2f$dist$2f$contexts$2f$i18n$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["I18nLabel"], {
                                label: "toc"
                            })
                        ]
                    }),
                    /* @__PURE__ */ (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsx"])(__TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$fumadocs$2d$ui$2f$dist$2f$components$2f$toc$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["TOCScrollArea"], {
                        children: tocOptions.style === "clerk" ? /* @__PURE__ */ (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsx"])(__TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$fumadocs$2d$ui$2f$dist$2f$components$2f$toc$2f$clerk$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["TOCItems"], {}) : /* @__PURE__ */ (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsx"])(__TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$fumadocs$2d$ui$2f$dist$2f$components$2f$toc$2f$default$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["TOCItems"], {})
                    }),
                    tocOptions.footer
                ]
            }))
        ]
    }));
}
function EditOnGitHub(props) {
    return /* @__PURE__ */ (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsx"])("a", {
        target: "_blank",
        rel: "noreferrer noopener",
        ...props,
        className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$tailwind$2d$merge$2f$dist$2f$bundle$2d$mjs$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__twMerge__as__cn$3e$__["cn"])((0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$fumadocs$2d$ui$2f$dist$2f$components$2f$ui$2f$button$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["buttonVariants"])({
            color: "secondary",
            size: "sm",
            className: "gap-1.5 not-prose"
        }), props.className),
        children: props.children ?? /* @__PURE__ */ (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxs"])(__TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Fragment"], {
            children: [
                /* @__PURE__ */ (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsx"])(__TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$fumadocs$2d$ui$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$square$2d$pen$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Edit$3e$__["Edit"], {
                    className: "size-3.5"
                }),
                /* @__PURE__ */ (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsx"])(__TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$fumadocs$2d$ui$2f$dist$2f$contexts$2f$i18n$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["I18nLabel"], {
                    label: "editOnGithub"
                })
            ]
        })
    });
}
/**
* Add typography styles
*/ function DocsBody({ children, className, ...props }) {
    return /* @__PURE__ */ (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsx"])("div", {
        ...props,
        className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$tailwind$2d$merge$2f$dist$2f$bundle$2d$mjs$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__twMerge__as__cn$3e$__["cn"])("prose flex-1", className),
        children
    });
}
function DocsDescription({ children, className, ...props }) {
    if (children === void 0) return null;
    return /* @__PURE__ */ (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsx"])("p", {
        ...props,
        className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$tailwind$2d$merge$2f$dist$2f$bundle$2d$mjs$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__twMerge__as__cn$3e$__["cn"])("mb-8 text-lg text-fd-muted-foreground", className),
        children
    });
}
function DocsTitle({ children, className, ...props }) {
    return /* @__PURE__ */ (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsx"])("h1", {
        ...props,
        className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$tailwind$2d$merge$2f$dist$2f$bundle$2d$mjs$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__twMerge__as__cn$3e$__["cn"])("text-[1.75em] font-semibold", className),
        children
    });
}
;
}),
"[project]/gitRepo/dashboard/docs/node_modules/fumadocs-ui/dist/page.js [app-client] (ecmascript) <locals>", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "DocsPage",
    ()=>DocsPage,
    "withArticle",
    ()=>withArticle
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$fumadocs$2d$ui$2f$dist$2f$utils$2f$cn$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$locals$3e$__ = __turbopack_context__.i("[project]/gitRepo/dashboard/docs/node_modules/fumadocs-ui/dist/utils/cn.js [app-client] (ecmascript) <locals>");
var __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$tailwind$2d$merge$2f$dist$2f$bundle$2d$mjs$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__twMerge__as__cn$3e$__ = __turbopack_context__.i("[project]/gitRepo/dashboard/docs/node_modules/tailwind-merge/dist/bundle-mjs.mjs [app-client] (ecmascript) <export twMerge as cn>");
var __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$fumadocs$2d$ui$2f$dist$2f$layouts$2f$docs$2f$client$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/gitRepo/dashboard/docs/node_modules/fumadocs-ui/dist/layouts/docs/client.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$fumadocs$2d$ui$2f$dist$2f$layouts$2f$docs$2f$page$2f$client$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/gitRepo/dashboard/docs/node_modules/fumadocs-ui/dist/layouts/docs/page/client.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$fumadocs$2d$ui$2f$dist$2f$layouts$2f$docs$2f$page$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$locals$3e$__ = __turbopack_context__.i("[project]/gitRepo/dashboard/docs/node_modules/fumadocs-ui/dist/layouts/docs/page/index.js [app-client] (ecmascript) <locals>");
var __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$fumadocs$2d$ui$2f$dist$2f$layouts$2f$notebook$2f$page$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$locals$3e$__ = __turbopack_context__.i("[project]/gitRepo/dashboard/docs/node_modules/fumadocs-ui/dist/layouts/notebook/page/index.js [app-client] (ecmascript) <locals>");
var __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/gitRepo/dashboard/docs/node_modules/next/dist/compiled/react/index.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/gitRepo/dashboard/docs/node_modules/next/dist/compiled/react/jsx-runtime.js [app-client] (ecmascript)");
'use client';
;
;
;
;
;
;
;
//#region src/page.tsx
/**
* For separate MDX page
*/ function withArticle(props) {
    return /* @__PURE__ */ (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsx"])("main", {
        ...props,
        className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$tailwind$2d$merge$2f$dist$2f$bundle$2d$mjs$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__twMerge__as__cn$3e$__["cn"])("w-full max-w-[1400px] mx-auto px-4 py-12", props.className),
        children: /* @__PURE__ */ (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsx"])("article", {
            className: "prose",
            children: props.children
        })
    });
}
function DocsPage({ lastUpdate, editOnGithub, children, ...props }) {
    const { DocsPage, EditOnGitHub, PageLastUpdate } = (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["use"])(__TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$fumadocs$2d$ui$2f$dist$2f$layouts$2f$docs$2f$client$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["LayoutContext"]) ? __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$fumadocs$2d$ui$2f$dist$2f$layouts$2f$docs$2f$page$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$locals$3e$__["page_exports"] : __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$fumadocs$2d$ui$2f$dist$2f$layouts$2f$notebook$2f$page$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$locals$3e$__["page_exports"];
    return /* @__PURE__ */ (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxs"])(DocsPage, {
        ...props,
        children: [
            children,
            /* @__PURE__ */ (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxs"])("div", {
                className: "flex flex-row flex-wrap items-center justify-between gap-4 empty:hidden",
                children: [
                    editOnGithub && /* @__PURE__ */ (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsx"])(EditOnGitHub, {
                        href: `https://github.com/${editOnGithub.owner}/${editOnGithub.repo}/blob/${editOnGithub.sha}/${editOnGithub.path.startsWith("/") ? editOnGithub.path.slice(1) : editOnGithub.path}`
                    }),
                    lastUpdate && /* @__PURE__ */ (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsx"])(PageLastUpdate, {
                        date: new Date(lastUpdate)
                    })
                ]
            })
        ]
    });
}
;
}),
"[project]/gitRepo/dashboard/docs/node_modules/fumadocs-ui/dist/page.js [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "DocsBody",
    ()=>__TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$fumadocs$2d$ui$2f$dist$2f$layouts$2f$docs$2f$page$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$locals$3e$__["DocsBody"],
    "DocsDescription",
    ()=>__TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$fumadocs$2d$ui$2f$dist$2f$layouts$2f$docs$2f$page$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$locals$3e$__["DocsDescription"],
    "DocsPage",
    ()=>__TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$fumadocs$2d$ui$2f$dist$2f$page$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$locals$3e$__["DocsPage"],
    "DocsTitle",
    ()=>__TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$fumadocs$2d$ui$2f$dist$2f$layouts$2f$docs$2f$page$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$locals$3e$__["DocsTitle"],
    "EditOnGitHub",
    ()=>__TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$fumadocs$2d$ui$2f$dist$2f$layouts$2f$docs$2f$page$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$locals$3e$__["EditOnGitHub"],
    "PageBreadcrumb",
    ()=>__TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$fumadocs$2d$ui$2f$dist$2f$layouts$2f$docs$2f$page$2f$client$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["PageBreadcrumb"],
    "PageLastUpdate",
    ()=>__TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$fumadocs$2d$ui$2f$dist$2f$layouts$2f$docs$2f$page$2f$client$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["PageLastUpdate"],
    "withArticle",
    ()=>__TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$fumadocs$2d$ui$2f$dist$2f$page$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$locals$3e$__["withArticle"]
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$fumadocs$2d$ui$2f$dist$2f$page$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$locals$3e$__ = __turbopack_context__.i("[project]/gitRepo/dashboard/docs/node_modules/fumadocs-ui/dist/page.js [app-client] (ecmascript) <locals>");
var __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$fumadocs$2d$ui$2f$dist$2f$layouts$2f$docs$2f$page$2f$client$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/gitRepo/dashboard/docs/node_modules/fumadocs-ui/dist/layouts/docs/page/client.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$fumadocs$2d$ui$2f$dist$2f$layouts$2f$docs$2f$page$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$locals$3e$__ = __turbopack_context__.i("[project]/gitRepo/dashboard/docs/node_modules/fumadocs-ui/dist/layouts/docs/page/index.js [app-client] (ecmascript) <locals>");
}),
]);

//# sourceMappingURL=9d758_2d37d636._.js.map