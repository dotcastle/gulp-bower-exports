/**
 * Export directive which is executed as a primary action
 */
interface IExportData {
	/**
	 * Id of the element
	 */
	name?: string;

	/**
	 * One or more package names that this directive is attached to
	 */
	from: string;

	/**
	 * Id of the source rule element
	 */
	select: string;

	/**
	 * Id(s) of name filter rule elements
	 */
	filter: string;

	/**
	 * Id(s) of rename rule elements
	 */
	rename: string;

	/**
	 * Id(s) of replace content rule elements
	 */
	replaceContent: string;

	/**
	 * Id of move rule element
	 */
	move: string;

	/**
	 * Use this package in the place of '#package#' token instead of the actual package name
	 * You can specify a folder as well - for e.g. 'angular/plugins'
	 */
	overridingMovePackageName?: string;

	/**
	 * Adjusts the hierarchy of the target files.
	 * Minimal will reduce the hierarchy depth to lowest possible extent.
	 * Flatten will remove hierarchy and copies all files to the target location
	 * (Warning: Flatten may cause some files to be overwritten).
	 * Default: None
	 */
	withHierarchy?: string;
}