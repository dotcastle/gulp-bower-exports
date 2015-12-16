/**
 * Transform context
 */
var TransformContext = (function () {
    /**
     * Constructor
     */
    function TransformContext(exportInstance, packageName, hierarchyAdjustment) {
        this._exportInstance = exportInstance;
        this._packageName = packageName;
        this._hierarchyAdjustment = hierarchyAdjustment;
        this.sourceFiles = [];
        this.moveFiles = [];
    }
    Object.defineProperty(TransformContext.prototype, "exportInstance", {
        /**
         * Export instance
         */
        get: function () {
            return this._exportInstance;
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(TransformContext.prototype, "packageName", {
        /**
         * Package name
         */
        get: function () {
            return this._packageName;
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(TransformContext.prototype, "hierarchyAdjustment", {
        /**
         * Hierarchy adjustment
         */
        get: function () {
            return this._hierarchyAdjustment;
        },
        enumerable: true,
        configurable: true
    });
    return TransformContext;
})();
module.exports = TransformContext;
