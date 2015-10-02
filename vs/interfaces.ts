/**
 * Options of the plugin
 */
interface IOptions {
	/**
	 * Current working directory
	 * Default: process.cwd()
	 */
	cwd?: string;

	/**
	 * External json file containing the exports section
	 * If null, the exports section is expected to be present in
	 * the bower.json file with the property name "bowerExports"
	 * Default: '<source file base name>.exports.json'
	 */
	externalExportsJsonFilePath?: string;

	/**
	 * Path of the bower_components folder relative to the source file.
	 * This setting takes precedence over bowerRcFilePath
	 * Default: <source file directory>/bower_components
	 */
	bowerComponentsDirectory?: string;

	/**
	 * Path of the .bowerrc file relative to the source file
	 * Default: ./.bowerrc in the same directory as source file
	 */
	bowerRcFilePath?: string;

	/**
	 * Whether to remove the bower.json file itself from the
	 * processing pipe upon successful processing of its contents
	 * and adding them to the pipeline
	 * Default: false
	 */
	passThroughSourceFiles?: boolean;

	/**
	 * Specify this flag to open the source files as non-readable
	 * This option is directly passed to the gulp src method with option 'read'
	 * Default: false
	 */
	nonReadableStreamedFiles?: boolean;

	/**
	 * The destination directory for gulp-changed. Same as you put into gulp.dest().
	 * Can also be a function returning a destination directory path.
	 */
	checkChangesDestination?: string;
}

/**
 * Key value pair
 */
interface IKeyValuePair<TKey, TValue> {
	/**
	 * Key
	 */
	key: TKey;

	/**
	 * Value
	 */
	value: TValue;
}

/**
 * The partial interface describing bower.json
 * This is the only part we need from the json
 */
interface IBowerJson {
	/**
	 * List of dependencies is an object of string key/value pairs
	 */
	dependencies: { [key: string]: string };

	/**
	 * Main section directing this plugin
	 */
	bowerExports: IBowerExports;
}

/**
 * Bower Rc Schema
 */
interface IBowerRc {
	/**
	 * bower_components directory
	 */
	directory: string;
}

/**
 * Bower Exports section
 * This is the full section if loaded from external exports json file
 */
interface IBowerExports {
	/**
	 * Contains a set of rules to be used by the exports directives
	 */
	rules: IRule | IRule[];

	/**
	 * Contains a set of export directives
	 */
	exports: IExport | IExport[];
}

/**
 * Type alias
 */
type IRule = ISourceRule | IFilterRule | IRenameRule | IReplaceContentRule | IMoveRule;

/**
 * Selects source files for processing
 */
interface ISourceRule {
	/**
	 * Rule type
	 */
	type: string;

	/**
	 * Id of the element
	 */
	id: string;

	/**
	 * One or more source glob patterns
	 */
	src: string;
}

/**
 * Filters source files for further processing
 */
interface IFilterRule {
	/**
	 * Rule type
	 */
	type: string;

	/**
	 * Id of the element
	 */
	id: string;

	/**
	 * Matches the file's full name (full relative path).
	 * Can be a normal string or a regex expression
	 */
	fullnameLike?: string;

	/**
	 * Matches the file's relative directory name.
	 * Can be a normal string or a regex expression
	 */
	dirnameLike?: string;

	/**
	 * Matches the file's file name (base name and extension).
	 * Can be a normal string or a regex expression
	 */
	filenameLike?: string;

	/**
	 * Matches the file's base name (name without extension).
	 * Can be a normal string or a regex expression
	 */
	basenameLike?: string;

	/**
	 * Matches the file's full name (extension name including leading period).
	 * Can be a normal string or a regex expression
	 */
	extnameLike?: string;
}

interface IRenameRule {
	/**
	 * Rule type
	 */
	type: string;

	/**
	 * Id of the element
	 */
	id: string;

	/**
	 * Phrase or regex pattern to search in the file name
	 */
	replace?: string;

	/**
	 * Type of the file name part to replace in
	 */
	in?: string;

	/**
	 * Phrase or regex replacement string to replace with
	 */
	with: string;
}

/**
 * Specifies criteria to replace contents of a file
 */
interface IReplaceContentRule {
	/**
	 * Rule type
	 */
	type: string;

	/**
	 * Id of the element
	 */
	id: string;

	/**
	 * Phrase or regex pattern to search in the file content
	 */
	replace?: string;

	/**
	 * Phrase or regex replacement string to replace with
	 */
	with: string;
}

/**
 * Specifies criteria to relocate the files to a different location relative to the dest directory
 */
interface IMoveRule {
	/**
	 * Rule type
	 */
	type: string;

	/**
	 * Id of the element
	 */
	id: string;

	/**
	 * Adjusts the hierarchy of the target files.
	 * Minimal will reduce the hierarchy depth to lowest possible extent.
	 * Flatten will remove hierarchy and copies all files to the target location
	 * (Warning: Flatten may cause some files to be overwritten).
	 * Default: None
	 */
	withHierarchy?: string;

	/**
	 * An absolute or a relative (wrt dest directory) directory to which to move the source files
	 */
	to: string;
}

/**
 * Specifies criteria to relocate the files to a different location relative to the dest directory
 */
interface ICheckChangesRule {
	/**
	 * Rule type
	 */
	type: string;

	/**
	 * Id of the element
	 */
	id: string;

	/**
	 * Extension of the destination files.
	 */
	extension?: string;

	/**
	 * Function that determines whether the source file is different from the destination file
	 */
	hasChanged?: string;
}

/**
 * Export directive which is executed as a primary action
 */
interface IExport {
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

	/**
	 * Id of changed rule element
	 */
	ifChanged: string;
}
