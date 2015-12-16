/**
 * Bower Exports section
 * This is the full section if loaded from external exports json file
 */
interface IBowerExportsData {
	/**
	 * Contains a set of rules to be used by the exports directives
	 */
	rules: IRuleData | IRuleData[];

	/**
	 * Rules to be applied when not specified in the exports
	 */
	defaultExportRules: IDefaultRulesData;

	/**
	 * Rules to be included to all exports
	 */
	appendExportRules: IIncludeRulesData;

	/**
	 * Contains a set of export directives
	 */
	exports: IExportData | IExportData[];
}
