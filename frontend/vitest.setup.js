"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var react_1 = require("@testing-library/react");
var vitest_1 = require("vitest");
require("@testing-library/jest-dom");
// Cleanup después de cada test
(0, vitest_1.afterEach)(function () {
    (0, react_1.cleanup)();
});
// Mock de window.matchMedia
Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vitest_1.vi.fn().mockImplementation(function (query) { return ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vitest_1.vi.fn(),
        removeListener: vitest_1.vi.fn(),
        addEventListener: vitest_1.vi.fn(),
        removeEventListener: vitest_1.vi.fn(),
        dispatchEvent: vitest_1.vi.fn(),
    }); }),
});
// Mock de IntersectionObserver
global.IntersectionObserver = /** @class */ (function () {
    function IntersectionObserver() {
    }
    IntersectionObserver.prototype.disconnect = function () { };
    IntersectionObserver.prototype.observe = function () { };
    IntersectionObserver.prototype.takeRecords = function () {
        return [];
    };
    IntersectionObserver.prototype.unobserve = function () { };
    return IntersectionObserver;
}());
