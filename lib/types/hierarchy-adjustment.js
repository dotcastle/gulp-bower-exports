/**
 * Hierarchy adjustment mode
 */
var HierarchyAdjustment;
(function (HierarchyAdjustment) {
    /**
     * Makes no changes to the hierarchy
     */
    HierarchyAdjustment[HierarchyAdjustment["None"] = 0] = "None";
    /**
     * Reduce the hierarchy depth to lowest possible extent
     */
    HierarchyAdjustment[HierarchyAdjustment["Minimized"] = 1] = "Minimized";
    /**
     * Remove hierarchy and copies all files to the target location
     * (Warning: This may cause some files to be overwritten)
     */
    HierarchyAdjustment[HierarchyAdjustment["Flattened"] = 2] = "Flattened";
})(HierarchyAdjustment || (HierarchyAdjustment = {}));
module.exports = HierarchyAdjustment;
