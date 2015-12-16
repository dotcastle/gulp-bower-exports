/**
 * Hierarchy adjustment mode
 */
enum HierarchyAdjustment {
	/**
	 * Makes no changes to the hierarchy
	 */
	None,

	/**
	 * Reduce the hierarchy depth to lowest possible extent
	 */
	Minimized,

	/**
	 * Remove hierarchy and copies all files to the target location
	 * (Warning: This may cause some files to be overwritten)
	 */
	Flattened
}
export = HierarchyAdjustment;