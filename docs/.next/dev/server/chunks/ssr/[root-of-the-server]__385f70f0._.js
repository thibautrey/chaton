module.exports = [
"[externals]/next/dist/shared/lib/no-fallback-error.external.js [external] (next/dist/shared/lib/no-fallback-error.external.js, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("next/dist/shared/lib/no-fallback-error.external.js", () => require("next/dist/shared/lib/no-fallback-error.external.js"));

module.exports = mod;
}),
"[project]/gitRepo/dashboard/docs/app/layout.tsx [app-rsc] (ecmascript, Next.js Server Component)", ((__turbopack_context__) => {

__turbopack_context__.n(__turbopack_context__.i("[project]/gitRepo/dashboard/docs/app/layout.tsx [app-rsc] (ecmascript)"));
}),
"[project]/gitRepo/dashboard/docs/app/docs/layout.tsx [app-rsc] (ecmascript, Next.js Server Component)", ((__turbopack_context__) => {

__turbopack_context__.n(__turbopack_context__.i("[project]/gitRepo/dashboard/docs/app/docs/layout.tsx [app-rsc] (ecmascript)"));
}),
"[project]/gitRepo/dashboard/docs/app/docs/[[...slug]]/page.tsx [app-rsc] (ecmascript)", ((__turbopack_context__) => {
"use strict";

return __turbopack_context__.a(async (__turbopack_handle_async_dependencies__, __turbopack_async_result__) => { try {

__turbopack_context__.s([
    "default",
    ()=>DocPage,
    "generateMetadata",
    ()=>generateMetadata,
    "generateStaticParams",
    ()=>generateStaticParams
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/gitRepo/dashboard/docs/node_modules/next/dist/server/route-modules/app-page/vendored/rsc/react-jsx-dev-runtime.js [app-rsc] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$fumadocs$2d$ui$2f$dist$2f$page$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/gitRepo/dashboard/docs/node_modules/fumadocs-ui/dist/page.js [app-rsc] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$api$2f$navigation$2e$react$2d$server$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__$3c$locals$3e$__ = __turbopack_context__.i("[project]/gitRepo/dashboard/docs/node_modules/next/dist/api/navigation.react-server.js [app-rsc] (ecmascript) <locals>");
var __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$client$2f$components$2f$navigation$2e$react$2d$server$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/gitRepo/dashboard/docs/node_modules/next/dist/client/components/navigation.react-server.js [app-rsc] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f2e$source$2f$server$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/gitRepo/dashboard/docs/.source/server.ts [app-rsc] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$lib$2f$source$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/gitRepo/dashboard/docs/lib/source.ts [app-rsc] (ecmascript)");
var __turbopack_async_dependencies__ = __turbopack_handle_async_dependencies__([
    __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f2e$source$2f$server$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__,
    __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$lib$2f$source$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__
]);
[__TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f2e$source$2f$server$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$lib$2f$source$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__] = __turbopack_async_dependencies__.then ? (await __turbopack_async_dependencies__)() : __turbopack_async_dependencies__;
;
;
;
;
;
async function DocPage(props) {
    const params = await props.params;
    const page = __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$lib$2f$source$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["source"].getPage(params.slug);
    if (!page) (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$client$2f$components$2f$navigation$2e$react$2d$server$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["notFound"])();
    const targetPath = params.slug?.length ? params.slug.join('/') : 'index';
    const doc = __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f2e$source$2f$server$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["docs"].docs.find((entry)=>entry.info.path.replace(/\.mdx?$/, '') === targetPath);
    if (!doc) (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$client$2f$components$2f$navigation$2e$react$2d$server$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["notFound"])();
    const MDX = doc.body;
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$fumadocs$2d$ui$2f$dist$2f$page$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["DocsPage"], {
        toc: doc.toc,
        full: doc.full,
        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$fumadocs$2d$ui$2f$dist$2f$page$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["DocsBody"], {
            children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])(MDX, {}, void 0, false, {
                fileName: "[project]/gitRepo/dashboard/docs/app/docs/[[...slug]]/page.tsx",
                lineNumber: 20,
                columnNumber: 9
            }, this)
        }, void 0, false, {
            fileName: "[project]/gitRepo/dashboard/docs/app/docs/[[...slug]]/page.tsx",
            lineNumber: 19,
            columnNumber: 7
        }, this)
    }, void 0, false, {
        fileName: "[project]/gitRepo/dashboard/docs/app/docs/[[...slug]]/page.tsx",
        lineNumber: 18,
        columnNumber: 5
    }, this);
}
async function generateStaticParams() {
    return __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$lib$2f$source$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["source"].generateParams();
}
async function generateMetadata(props) {
    const params = await props.params;
    const page = __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$lib$2f$source$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["source"].getPage(params.slug);
    if (!page) (0, __TURBOPACK__imported__module__$5b$project$5d2f$gitRepo$2f$dashboard$2f$docs$2f$node_modules$2f$next$2f$dist$2f$client$2f$components$2f$navigation$2e$react$2d$server$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["notFound"])();
    return {
        title: page.data.title,
        description: page.data.description
    };
}
__turbopack_async_result__();
} catch(e) { __turbopack_async_result__(e); } }, false);}),
"[project]/gitRepo/dashboard/docs/app/docs/[[...slug]]/page.tsx [app-rsc] (ecmascript, Next.js Server Component)", ((__turbopack_context__) => {

__turbopack_context__.n(__turbopack_context__.i("[project]/gitRepo/dashboard/docs/app/docs/[[...slug]]/page.tsx [app-rsc] (ecmascript)"));
}),
];

//# sourceMappingURL=%5Broot-of-the-server%5D__385f70f0._.js.map