/**
 * Rules to be included to all exports
 */
interface IIncludeRulesData {
	/**
	 * Id of the source rule element
	 */
	source?: string;

	/**
	 * Id(s) of name filter rule elements
	 */
	filter?: string;

	/**
	 * Id(s) of rename rule elements
	 */
	rename?: string;

	/**
	 * Id(s) of replace content rule elements
	 */
	replaceContent?: string;
}
