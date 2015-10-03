import fs = require('fs');
import path = require('path');
import stream = require('stream');
import gUtil = require('gulp-util');
import File = require('vinyl');
import vinylSrc = require('vinyl-fs');
import Q = require('q');
import Enumerable = require('linq');

import {PluginError} from 'gulp-util';
import {StringDecoder} from 'string_decoder';

var multistream = <Function>require('multistream');
var gChanged = <Function>require('gulp-changed');

/**
 * Debug Flag
 */
const DEBUG: boolean = true;

/**
 * Rule type alias
 */
type Rule = SourceRule | FilterRule | RenameRule | ReplaceContentRule | MoveRule | CheckChangesRule;
type ReadableStreamCreator = () => NodeJS.ReadableStream;

/**
 * Rule type
 */
enum RuleType {
	Source,
	Filter,
	Rename,
	ReplaceContent,
	Move,
	CheckChanges
}

/**
 * File name part
 */
enum FileNamePart {
	FullName,
	DirName,
	FileName,
	BaseName,
	ExtName
}

/**
 * Log type
 */
enum LogType {
	Information,
	Success,
	Warning,
	Error
}

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

/**
 * Simple file info
 */
interface IFileInfo {
	cwd: string;
	base: string;
	path: string;
	relative: string;
	isNull: boolean;
	isDirectory: boolean;
}

/**
 * Plugin execution context
 */
interface IExecutionContext {
	exportInstance: Export;
	packageName: string;

	sourceFiles: File[];
	moveFiles: File[];
}

/**
 * Utilities class
 */
abstract class Utils {
	/**
	 * Checks if the object is of the specified type
	 * @param obj - Object to test
	 * @param types - Types to check against
	 * @returns {boolean} - True if the object is of the specified type. False otherwise
	 */
	public static isAnyType(obj: any, ...types: (string | Function)[]): boolean {
		var objType = typeof (obj);
		var typesEnum = Enumerable.from(types);
		var checkType = (...allowedTypes: any[]) => {
			return typesEnum.intersect(Enumerable.from(allowedTypes)).any();
		};

		if (objType === 'undefined') {
			return checkType('undefined') || typesEnum.any(p => typeof(p) === 'undefined');
		} else if (obj === null) {
			return checkType(null, 'null');
		} else if (objType === 'function') {
			return checkType(Function, 'function');
		} else if (objType === 'boolean') {
			return checkType(Boolean, 'boolean');
		} else if (objType === 'string') {
			return checkType(String, 'string');
		} else if (objType === 'number') {
			return checkType(Number, 'number');
		} else if (objType === 'object') {
			if (checkType(Object, 'object')) {
				return true;
			}
			return typesEnum.any(t => {
				// ReSharper disable once SuspiciousTypeofCheck
				if (typeof(t) === 'string') {
					try {
						return obj instanceof <Function>eval(<string>t);
					} catch (e) {
						return false;
					}
				}
				return obj instanceof <Function>t;
			});
		}
		return false;
	}

	/**
	 * Checks if the object is of the specified type
	 * @param obj - Object to test
	 * @param type - Type to check against
	 * @returns {boolean} - True if the object is of the specified type. False otherwise
	 */
	public static isType(obj: any, type: string | Function): boolean {
		return Utils.isAnyType(obj, type);
	}

	/**
	 * Checks if the specified object is a string and non-empty
	 * @param str - String to check
	 * @param undefinedValue - Value to use if the specified string undefined
	 * @param nullValue - Value to use if the specified string null
	 * @param nonStringValue - Value to use if the specified value is not a string
	 * @param emptyValue - Value to use if the specified string empty
	 * @returns {string} - Adjusted string
	 */
	public static trimAdjustString(str: string, undefinedValue: string, nullValue: string, nonStringValue: string, emptyValue: string): string {
		// Check if valid
		if (typeof(str) === 'undefined') {
			return undefinedValue;
		} else if (str === null) {
			return nullValue;
		} else if (typeof(str) !== 'string') {
			return nonStringValue;
		// ReSharper disable once QualifiedExpressionMaybeNull
		} else if ((str = str.trim()).length === 0) {
			return emptyValue;
		} else {
			return str;
		}
	}

	/**
	 * Creates a proxy for the specified function to run in the specified context
	 * @param func - Function
	 * @param context - Context
	 * @returns {Function} - Proxy function
	 */
	public static proxy<T extends Function>(func: T, context: any): T {
		// ReSharper disable once Lambda
		return <T><any>(function (): any {
			return func.apply(context, arguments);
		});
	}

	/**
	 * Converts an object to string
	 * @param obj
	 * @returns {string} String representing the object
	 */
	public static toStr(obj: any, beautifySpaces: number = 0): string {
		if (typeof (obj) === 'undefined') {
			return '<undefined>';
		} else if (obj === null) {
			return '<null>';
		} else if (typeof(obj) === 'string') {
			return <string>obj;
		}

		// Try getting from toString
		var hasStr = false;
		var str: string = null;
		try {
			// ReSharper disable once QualifiedExpressionMaybeNull
			str = obj.toString();

			// Check if the text is the default one
			if (Utils.isType(str ,String) && (str !== '[object Object]')) {
				hasStr = true;
			}
		} catch (e) { }

		// Try other methods if we do not have str
		if (!hasStr) {
			try {
				str = JSON.stringify(obj, null, beautifySpaces);
			} catch (e) {
				// ReSharper disable once QualifiedExpressionMaybeNull
				str = obj.toString() + ' (JSON.stringify failed (' + e.toString() + '). Using obj.toString)';
			}
		}

		// Append Stack Trace
		if (DEBUG) {
			if (obj['stack']) {
				str += ' (stacktrace: ' + Utils.toStr(obj['stack']) + ')';
			} else if (obj['stacktrace']) {
				str += ' (stacktrace: ' + Utils.toStr(obj['stacktrace']) + ')';
			}
		}
		return str;
	}

	/**
	 * Creates a new unique id
	 */
	public static generateUniqueRuleId(ruleType: RuleType): string {
		return RuleType[ruleType].toLowerCase() + '-' + new Date().getTime();
	}

	/**
	 * Returns a resolved promise
	 * @param result - Resolution result
	 * @returns {Q.Promise<T>} - Resolved promise
	 */
	public static resolvedPromise<T>(result?: T): Q.Promise<T> {
		var deferred = Q.defer<T>();
		deferred.resolve(result);
		return deferred.promise;
	}

	/**
	 * Returns a rejected promise
	 * @param result - Resolution result
	 * @returns {Q.Promise<T>} - Resolved promise
	 */
	public static rejectedPromise<T>(e?: any): Q.Promise<T> {
		var deferred = Q.defer<T>();
		deferred.reject(e);
		return deferred.promise;
	}

	/**
	 * Transfers the promise to the specified deferred object
	 * @param promise - Source promise
	 * @param deferred - Destination deferred
	 */
	public static transferPromise<T>(promise: Q.Promise<T>, deferred: Q.Deferred<T>): void {
		promise.then(d => deferred.resolve(d))
			.catch(e => deferred.reject(e));
	}

	/**
	 * Finds common segment in a set of strings
	 */
	public static findCommonSegment(strs: string[]): string {
		if (!Utils.isType(strs, Array)) {
			return null;
		}

		var strsEnum = Enumerable.from(strs).where(p => Utils.isType(p, String));
		var itemCount = strsEnum.count();
		if (itemCount === 0) {
			return null;
		}

		var firstItem = strsEnum.first();
		if (itemCount === 1) {
			return firstItem;
		}

		var commonSegment = '';
		var minLength = strsEnum.min(p => p.length);
		for (var i = 0; i < minLength; ++i) {
			var ch = firstItem[i];
			var allHaveSameCh = strsEnum.all(p => p[i] === ch);
			if (allHaveSameCh) {
				commonSegment += ch;
			} else {
				break;
			}
		}
		return commonSegment;
	}

	/**
	 * Removes the common path segment from the file
	 */
	public static removeCommonPathSegment(file: File, commonPathSegment: string): void {
		commonPathSegment = Utils.trimAdjustString(commonPathSegment, null, null, null, null);
		if (commonPathSegment === null) {
			return;
		}

		var dir = path.dirname(file.relative);
		var baseName = path.basename(file.relative);

		// ReSharper disable once QualifiedExpressionMaybeNull
		if (dir.toLowerCase().indexOf(commonPathSegment.toLowerCase()) === 0) {
			dir = dir.substr(commonPathSegment.length);
			if (commonPathSegment.indexOf('./') === 0) {
				dir = './' + dir;
			} else if (commonPathSegment.indexOf('.\\') === 0) {
				dir = '.\\' + dir;
			}
			Utils.setFilePath(file, path.join(dir, baseName));
		}
	}

	/**
	 * Sets file's path
	 * @param file - File
	 * @param relativePath - Relative path
	 */
	public static setFilePath(file: File, relativePath: string): void {
		file.path = path.join(file.base, relativePath);
		if ((<any>file).sourceMap) {
			(<any>file).sourceMap.file = file.relative;
		}
	}

	/**
	 * Escapes regex special characters
	 * @returns {string} - Escaped string
	 */
	public static escapeRegexCharacters(str: string): string {
		return Utils.isType(str, String) ? str.replace(/[\\^$*+?.()|[\]{}]/g, '\\$&') : str;
	}

	/**
	 * Converts a string to a Regex
	 * @param obj - String of the format "\/\\.*\/gi" or a RegExp instance
	 * @param strMatchTypeComplete - If the specified object is a string, whether to make the regex
	 *		match the complete string
	 * @returns {RegExp} - RegExp instance
	 */
	public static toRegExp(obj: string | RegExp, strMatchTypeComplete: boolean): RegExp {
		if (Utils.isType(obj, RegExp)) {
			return <RegExp><any>obj;
		} else if (Utils.isAnyType(obj, 'undefined', 'null')) {
			return null;
		} else if (typeof (obj) !== 'string') {
			var err = new Error(Utils.formatString('Invalid expression for RegExp conversion (specified: {0})',
									obj));
			throw err;
		}

		var str = <string>obj;
		var trimmedStr = str.trim();
		var nextIndexOfSlash, pattern, flags;

		if ((trimmedStr.indexOf('/') === 0)
			&& ((nextIndexOfSlash = trimmedStr.indexOf('/', 1)) >= 1)
			&& (trimmedStr.indexOf('/', nextIndexOfSlash + 1) < 0)) {
			// This is a regex string
			pattern = trimmedStr.substr(1, nextIndexOfSlash - 1).trim();
			flags = trimmedStr.substr(nextIndexOfSlash + 1).trim() || 'g';
		} else {
			// This is a normal string
			pattern = (strMatchTypeComplete ? '^' : '')
				+ Utils.escapeRegexCharacters(str)
				+ (strMatchTypeComplete ? '$' : '');
			flags = 'g';
		}

		try {
			return new RegExp(pattern, flags);
		} catch (e) {
			Utils.log(LogType.Warning,
				'Regex creation failed (pattern: {0}, flags: {1}, reason: {2})',
				pattern, flags, e);
			throw e;
		}
	}

	/**
	 * Tests whether the str matches the pattern
	 * http://stackoverflow.com/questions/1520800/why-regexp-with-global-flag-in-javascript-give-wrong-results
	 */
	public static testRegExp(regExp: RegExp, str: string): boolean {
		if (!regExp || !Utils.isType(str, String)) {
			return false;
		}

		// Test & reset
		var result = regExp.test(str);
		regExp.lastIndex = 0;
		return result;
	}

	/**
	 * Simple file info
	 */
	public static toFileInfo(file: File): IFileInfo {
		var fileInfo = <IFileInfo>{};
		try { fileInfo.cwd = file.cwd; } catch (e) { }
		try { fileInfo.base = file.base; } catch (e) { }
		try { fileInfo.path = file.path; } catch (e) { }
		try { fileInfo.relative = file.relative; } catch (e) { }
		try { fileInfo.isNull = file.isNull(); } catch (e) { }
		try { fileInfo.isDirectory = file.isDirectory(); } catch (e) { }
		return fileInfo;
	}

	/**
	 * Simple file info
	 */
	public static toFileInfos(files: File[]): IFileInfo[] {
		return Enumerable.from(files).select(Utils.toFileInfo).toArray();
	}

	/**
	 * Simple file info
	 */
	public static toFile(fileInfo: IFileInfo, createContents: boolean = true): File {
		return new File({
			cwd: fileInfo.cwd,
			base: fileInfo.base,
			path: fileInfo.path,
			contents: createContents ? fs.readFileSync(fileInfo.path) : undefined
		});
	}

	/**
	 * Simple file info
	 */
	public static toFiles(fileInfos: IFileInfo[], createContents: boolean = true): File[] {
		return Enumerable.from(fileInfos).select(f => Utils.toFile(f, createContents)).toArray();
	}

	/**
	 * Adjusts the given enum value to be valid
	 * @param val - Value to adjust
	 * @param defaultValue - Default value to return if val could not be converted
	 * @param typeObject - Enum type
	 * @param caseSensitive - Whether to use case sensitive comparisons
	 * @returns {TType} - Converted value
	 */
	public static adjustEnumValue<TType>(val: any, defaultValue: TType, typeObject: any, caseSensitive?: boolean): TType {
		// Default value if not valid
		if (!Utils.isAnyType(val, 'number', 'string')
			|| ((typeof (val) === 'number') && isNaN(val))) {
			return defaultValue;
		}

		// Convert string to num
		if (typeof (val) === 'string') {
			var textVal: string = (<string>val).trim();
			if (textVal) {
				for (var prop in typeObject) {
					if (typeObject.hasOwnProperty(prop)) {
						if ((!caseSensitive && (textVal.toLowerCase() === prop.toString().toLowerCase()))
							|| (caseSensitive && (textVal === prop.toString()))) {
							// Check if this is a number
							var propNum = parseInt(prop);
							if (!isNaN(propNum) && (propNum.toString() === prop.toString())
								&& (typeObject[typeObject[prop]] === prop)) {
								return <TType><any>propNum;
							}
							return typeObject[prop];
						}
					}
				}
			}
			return defaultValue;
		}

		// Number
		if (typeof (val) === 'number') {
			if (typeof (typeObject[val]) == 'undefined') {
				return defaultValue;
			} else {
				return val;
			}
		}

		// Return Default
		return defaultValue;
	}

	/**
	 * Gets all properties on the object
	 * @param obj - Object to get properties from
	 * @returns {IKeyValuePair<string, TValue>[]} - Key valie pair array
	 */
	public static getProperties<TValue>(obj: any): IKeyValuePair<string, TValue>[] {
		if (Utils.isAnyType(obj, 'undefined', 'null')) {
			return [];
		}

		var arr: IKeyValuePair<string, TValue>[] = [];
		for (var prop in obj) {
			if (obj.hasOwnProperty(prop)) {
				arr.push({ key: prop, value: obj[prop] });
			}
		}
		return arr;
	}

	/**
	 * Ensures that the specified data is an array. If the data is not an array, it is wrapped
	 * in a new array instance, optionally removing invalid items in the array
	 * @param data - Data
	 * @param validator - Item validator
	 * @returns {TOutput[]} - Data array
	 */
	public static ensureArray<TInput, TOutput>(data: TInput | TInput[], transformer?: (item: TInput, index: number) => TOutput | TOutput[]): TOutput[] {
		if (typeof (data) === 'undefined') {
			return null;
		}
		if (!(data instanceof Array)) {
			data = [<TInput>data];
		}

		var srcData: TInput[] = <TInput[]>data;
		var resultData: TOutput[] = [];
		transformer = Utils.isType(transformer, Function)
			? transformer
			: ((item: TInput, index: number) => { return <TOutput><any>item; });

		for (var i = 0, n = srcData.length; i < n; ++i) {
			var outItems: TOutput[] = <TOutput[]>transformer(srcData[i], i);

			// Undefined
			if (typeof (outItems) === 'undefined') {
				// Skip
				continue;
			} else if (outItems === null) {
				resultData.push(null);
				continue;
			}

			// Convert to array
			if (!(outItems instanceof Array)) {
				outItems = <TOutput[]><any>[outItems];
			}

			// Inject
			resultData = resultData.concat(Enumerable.from(outItems).where(p => !Utils.isType(p, 'undefined')).toArray());
		}
		return resultData;
	}

	/**
	 * Formats the given string
	 * @param format - String format
	 * @param args - Argument list
	 * @returns {string} - Formatted string
	 */
	public static formatString(format: string, ...args: any[]): string {
		if (typeof (format) !== 'string') {
			return format;
		}

		args = args || [];
		Enumerable.from(args).forEach((a, i) =>
			format = format.replace(new RegExp('\\{' + i + '\\}', 'g'),
				Utils.toStr(a)));
		return format;
	}

	/**
	 * Creates a transform
	 */
	public static createTransform(transformMethod: (transform: stream.Transform, file: File, encoding: string, data?: any) => Q.Promise<any>,
		flushMethod?: (transform: stream.Transform, data?: any) => Q.Promise<any>,
		data?: any, transformOptions?: any): stream.Transform {

		// https://nodejs.org/api/stream.html#stream_class_stream_transform_1
		var transformStream: stream.Transform = null;

		transformOptions = transformOptions || {};
		transformOptions.objectMode = true;
		transformOptions.highWaterMark = BowerExportsPlugin.TransformStreamReadableHighWaterMark;

		// https://nodejs.org/api/stream.html#stream_transform_transform_chunk_encoding_callback
		transformOptions.transform = (file: File, encoding: string, callback: (err?: Error, data?: any) => void) => {
			transformMethod(transformStream, file, encoding, data)
				.then(() => { callback(); })
				.catch(e => { callback(e); });
		};

		if (flushMethod) {
			transformOptions.flush = (callback: (e?: any) => void) => {
				flushMethod(transformStream, data)
					.then(() => callback())
					.catch(e => callback(e || new Error('An unknown error has occurred')));
			};
		}

		// Primary Bower.json processing transform
		// https://nodejs.org/api/stream.html#stream_class_stream_transform_1
		return transformStream = new stream.Transform(transformOptions);
	}

	/**
	 * Transfers files from a readable stream to a transform
	 */
	public static transferFiles(readable: NodeJS.ReadableStream, transform: stream.Transform): Q.Promise<any> {
		var eventEmitter;
		readable.on('data', eventEmitter = (file: File) => {
			transform.push(file);
		});
		return Utils.createReadableStreamCompletionPromise(readable)
			.finally(() => {
				readable.removeListener('data', eventEmitter);
			});
	}

	/**
	 * *Stream completion promise
	 * @param stream - Stream
	 */
	public static createReadableStreamCompletionPromise(stream: NodeJS.ReadableStream): Q.Promise<any> {
		var deferred = Q.defer();
		// ReSharper disable once JoinDeclarationAndInitializerJs
		var onDone, onError = null, doneEmitter = null, errorEmitter = null;

		onDone = () => {
			deferred.resolve(undefined);
			if (errorEmitter) {
				errorEmitter.removeListener('error', onError);
			}
		};
		onError = e => {
			deferred.reject(e);
			if (doneEmitter) {
				doneEmitter.removeListener('end', onDone);
			}
		};

		doneEmitter = stream.once('end', onDone);
		errorEmitter = stream.once('error', onError);

		return deferred.promise;
	}

	/**
	 * *Stream completion promise
	 * @param stream - Stream
	 */
	public static createWritableStreamCompletionPromise(stream: NodeJS.WritableStream): Q.Promise<any> {
		var deferred = Q.defer();
		// ReSharper disable once JoinDeclarationAndInitializerJs
		var onDone, onError = null, doneEmitter = null, errorEmitter = null;

		onDone = () => {
			deferred.resolve(undefined);
			if (errorEmitter) {
				errorEmitter.removeListener('error', onError);
			}
		};
		onError = e => {
			deferred.reject(e);
			if (doneEmitter) {
				doneEmitter.removeListener('finish', onDone);
			}
		};

		doneEmitter = stream.once('finish', onDone);
		errorEmitter = stream.once('error', onError);

		return deferred.promise;
	}

	/**
	 * Pushes data into the transform stream
	 * https://nodejs.org/api/stream.html#stream_event_drain
	 * @param transform - Transform
	 * @param files - Files to push
	 * @returns {Q.Promise<any>} Promise
	 */
	public static pushFiles(transform: stream.Transform, files: File[]): Q.Promise<any> {
		var pushQueue = (<File[]>[]).concat(files || []);
		if (pushQueue.length === 0) {
			return Utils.resolvedPromise();
		}

		var deferred = Q.defer<any>();
		var canPush = true;
		var doPush = () => {
			do {
				// Push
				var item = pushQueue.shift();
				try {
					canPush = transform.push(item);

					// Check queue length
					if (pushQueue.length === 0) {
						deferred.resolve(undefined);
						return;
					}

					// Set a timeout
					if (!canPush) {
						transform.once('data', () => {
							process.nextTick(() => {
								canPush = true;
								doPush();
							});
						});
					}
				} catch (e) {
					Utils.log(LogType.Error,
						'Failed to push file to the pipeline (path: \'{0}\', reason: \'{1}\')',
						item.path, e);
					deferred.reject(undefined);
					return;
				}
			} while (canPush && (pushQueue.length > 0))
		};

		// Do
		doPush();

		// Return
		return deferred.promise;
	}

	/**
	 * Converts a buffer to text
	 * @param buffer - Buffer to read from
	 * @param encoding - Optional encoding
	 * @returns {string} - Text
	 */
	public static bufferToText(buffer: Buffer, encoding?: string): string {
		return new StringDecoder(Utils.trimAdjustString(encoding, 'utf8', 'utf8', 'utf8', 'utf8')).write(buffer);
	}

	/**
	 * Converts a stream to a buffer
	 * @param readableStream - Stream
	 * @returns {Buffer} - Buffer containing the stream's data
	 */
	public static streamToBuffer(readableStream: Buffer | NodeJS.ReadableStream): Q.Promise<Buffer> {
		// Deferred
		var deferred = Q.defer<Buffer>();

		// Check if already buffer
		if (gUtil.isBuffer(readableStream)) {
			deferred.resolve(<Buffer><any>readableStream);
			return deferred.promise;
		}

		// Read
		let fileBuffer: Buffer = new Buffer(0);
		(<NodeJS.ReadableStream>readableStream).on('data', (chunk) => {
			if (typeof (chunk) === 'string') {
				fileBuffer = Buffer.concat([fileBuffer, new Buffer(chunk)]);
			} else {
				fileBuffer = Buffer.concat([fileBuffer, chunk]);
			}
		});
		(<NodeJS.ReadableStream>readableStream).on('end', () => {
			deferred.resolve(fileBuffer);
		});
		(<NodeJS.ReadableStream>readableStream).on('error', (e: Error) => {
			deferred.reject(e);
		});

		// Return
		return deferred.promise;
	}

	/**
	 * Converts a buffer to a readable stream
	 * @param buffer - Buffer
	 * @returns {stream.PassThrough} - Readable/Writable stream
	 */
	public static bufferToStream(buffer: Buffer | NodeJS.ReadableStream): NodeJS.ReadableStream {
		// Check if already stream
		if (gUtil.isStream(buffer)) {
			if (buffer instanceof stream.Readable) {
				return <stream.Readable><any>buffer;
			} else {
				throw new Error('A non-readable stream cannot be converted to a readable stream');
			}
		}

		// Create
		var readableStream = new stream.PassThrough({ objectMode: true });
		readableStream.end(<Buffer>buffer);
		return readableStream;
	}

	/**
	 * Reads a file asynchronously
	 * @param path - Path of the file
	 * @param encoding - Option string encoding
	 * @returns {Q.Promise<string | Buffer>} - If encoding is specified, string data is returned.
	 *		Else raw buffer is returned.
	 */
	public static readFile(path: string, encoding?: string): Q.Promise<string | Buffer> {
		var deferred = Q.defer<string | Buffer>();
		if (!Utils.isType(path, String) || ((path = path.trim()).length === 0)) {
			deferred.reject(new Error('File or directory \'' + Utils.toStr(path) + '\' is not valid'));
		} else {
			fs.readFile(path, encoding, (err: Error, data: any) => {
				if (err) {
					// Error
					deferred.reject(err);
				} else {
					deferred.resolve(data);
				}
			});
		}
		return deferred.promise;
	}

	/**
	 * Parses the specified text or buffer tp JSON
	 * @param obj - Text or buffer
	 * @param encoding - Encoding to use while converting to string, if the specified object is a buffer
	 * @returns {Q.Promise<T>} - Json object
	 */
	public static parseJson<T>(obj: string | Buffer, encoding?: string): Q.Promise<T> {
		if (!Utils.isAnyType(obj, String, Buffer)) {
			return Utils.rejectedPromise<T>(new Error('Invalid data to parse as JSON (expecting string or Buffer)'));
		}

		var str = (obj instanceof Buffer) ? Utils.bufferToText(<Buffer>obj, encoding) : <string>obj;
		try {
			return Utils.resolvedPromise<T>(JSON.parse(str.trim()));
		} catch (e) {
			return Utils.rejectedPromise<T>(e);
		}
	}

	/**
	 * Reads a json file asynchronously
	 * @param path - Path of the file
	 * @param encoding - Option string encoding
	 * @returns {Q.Promise<string | Buffer>} - If encoding is specified, string data is returned.
	 *		Else raw buffer is returned.
	 */
	public static readText(path: string, encoding: string = 'utf8'): Q.Promise<string> {
		var deferred = Q.defer<string>();
		encoding = Utils.trimAdjustString(encoding, 'utf8', 'utf8', 'utf8', 'utf8');

		if (!Utils.isType(path, String) || ((path = path.trim()).length === 0)) {
			deferred.reject(new Error('File or directory \'' + Utils.toStr(path) + '\' is not valid'));
		} else {
			fs.readFile(path, encoding, (err: Error, data: any) => {
				if (err) {
					// Error
					deferred.reject(err);
				} else {
					// Parse JSON
					try {
						deferred.resolve(<string>data);
					} catch (e) {
						// Error
						deferred.reject(e);
					}
				}
			});
		}
		return deferred.promise;
	}

	/**
	 * Reads a json file asynchronously
	 * @param path - Path of the file
	 * @param encoding - Option string encoding
	 * @returns {Q.Promise<string | Buffer>} - If encoding is specified, string data is returned.
	 *		Else raw buffer is returned.
	 */
	public static readJson<T>(path: string, encoding: string = 'utf8'): Q.Promise<T> {
		var deferred = Q.defer<T>();
		encoding = Utils.trimAdjustString(encoding, 'utf8', 'utf8', 'utf8', 'utf8');

		if (!Utils.isType(path, String) || ((path = path.trim()).length === 0)) {
			deferred.reject(new Error('File or directory \'' + Utils.toStr(path) + '\' is not valid'));
		} else {
			fs.readFile(path, encoding, (err: Error, data: any) => {
				if (err) {
					// Error
					deferred.reject(err);
				} else {
					// Parse JSON
					try {
						deferred.resolve(JSON.parse((<string>data).trim()));
					} catch (e) {
						// Error
						deferred.reject(e);
					}
				}
			});
		}
		return deferred.promise;
	}

	/**
	 * Checks if a path exists
	 * @param path - Path
	 */
	public static fileOrDirectoryExists(path: string): Q.Promise<string> {
		var deferred = Q.defer<string>();
		if (!Utils.isType(path, String) || ((path = path.trim()).length === 0)) {
			deferred.reject(new Error('File or directory \'' + Utils.toStr(path) + '\' is not valid'));
		} else {
			fs.exists(path, exists => {
				if (exists) {
					deferred.resolve(path);
				} else {
					deferred.reject(new Error('File or directory \'' + path + '\' does not exist'));
				}
			});
		}
		return deferred.promise;
	}

	/**
	 * Logs the message to console or gUtil.log
	 * @param logType - Log type of the message
	 * @param format - Message format
	 * @param args - Format arguments
	 */
	public static log(logType: LogType, format: string, ...args: any[]): void {
		var allArgs: any[] = [];

		// Detect type name prefix
		var typeNamePrefix = LogType[logType].toUpperCase();

		// Color
		switch(logType) {
			case LogType.Information:
				{
					allArgs.push(gUtil.colors.blue(typeNamePrefix));
					break;
				}
			case LogType.Success:
				{
					allArgs.push(gUtil.colors.green(typeNamePrefix));
					break;
				}
			case LogType.Warning:
				{
					allArgs.push(gUtil.colors.yellow(typeNamePrefix));
					break;
				}
			case LogType.Error:
				{
					allArgs.push(gUtil.colors.red(typeNamePrefix));
					break;
				}
			default:
				{
					allArgs.push(typeNamePrefix);
					break;
				}
		}

		allArgs.push(':');
		allArgs.push(Utils.formatString.apply(null, [format].concat(args)));

		// Log
		gUtil.log.apply(gUtil, allArgs);
	}
}

/**
 * Source Rule
 */
class SourceRule {
	public plugin: BowerExportsPlugin;
	public type: RuleType = RuleType.Source;
	public id: string;

	public src: string[];
	public resolvedSrc: { [key: string]: string[] };

	/**
	 * Constructor
	 */
	constructor(plugin: BowerExportsPlugin, data: ISourceRule) {
		this.plugin = plugin;
		this.id = data.id;

		var src: any = Utils.trimAdjustString(data.src, null, null, null, null);
		src = src ? src.split(',') : src;
		this.src = Utils.ensureArray(src, s => Utils.trimAdjustString(s, undefined, undefined, undefined, undefined));
	}

	/**
	 * Whether this instance is valid
	 */
	public get valid(): boolean {
		return !!this.src && !!this.src.length;
	}

	/**
	 * Resolves the source patterns
	 */
	public resolve(packageNames: string[], exportName: string): Q.Promise<any> {
		if (this.resolvedSrc) {
			return Utils.resolvedPromise();
		}

		this.resolvedSrc = {};
		return Q.all(Enumerable.from(packageNames).select(p =>
			this.getSrc(p, exportName)
				.then(s => {
					if ((s.length === 0) || !Enumerable.from(s).any(p => p.indexOf('!') < 0)) {
						Utils.log(LogType.Error,
							'No positive source glob pattern specified (export: \'{0}\', src: \'{1}\')',
							exportName, this.src);
						return Utils.rejectedPromise<string[]>();
					}

					// Save
					this.resolvedSrc[p] = s;
					return Utils.resolvedPromise<string[]>();
				})
				.catch(e => {
					Utils.log(LogType.Error,
						'Failed to resolve source patterns (export: \'{0}\', src: \'{1}\', package: \'{2}\' reason: \'{3}\')',
						exportName, this.src, p, e);
					return Utils.rejectedPromise<string[]>();
				}))
			.toArray());
	}

	/**
	 * Gets the source files
	 * @returns {string[]} - Src glob patterns
	 */
	private getSrc(packageName: string, exportName: string): Q.Promise<string[]> {
		var promise = Utils.resolvedPromise(Enumerable.from(this.src).toArray());

		// Return
		return promise

		// Main Files
			.then(src => {
				var itemIndex = Enumerable.from(src).indexOf(p => Utils.testRegExp(BowerExportsPlugin.MainSrcTokenRegex, p));
				if (itemIndex >= 0) {
					return this.getPackageMainFiles(packageName, exportName)
						.then(s => {
							return src.slice(0, itemIndex).concat(s).concat(src.slice(itemIndex + 1));
						})
						.catch(() => {
							return src.slice(0, itemIndex).concat(src.slice(itemIndex + 1));
						});
				} else {
					return src;
				}
			})

		// Package name
			.then(src => {
				return this.resolvedSrc[packageName] = Enumerable.from(src)
					.select(s => this.plugin.replacePackageToken(s, packageName))
					.toArray();
			});
	}

	/**
	 * Returns package's main file list
	 * @param pkgName - Package name
	 */
	private getPackageMainFiles(packageName: string, exportName: string): Q.Promise<string[]> {
		// Check if we already have them
		var mainFiles: string[] = this.plugin.packageMainFiles[packageName];
		if (mainFiles && (mainFiles instanceof Array)) {
			return Utils.resolvedPromise(mainFiles);
		}

		// Path
		var pkgFolderPath = path.resolve(this.plugin.options.cwd, this.plugin.bowerComponentsDirectory, packageName);
		var bowerJsonPath = path.join(pkgFolderPath, '.bower.json');

		// Process
		return Utils.readJson(bowerJsonPath)
			.then(bowerJson => {
				mainFiles = Utils.ensureArray(bowerJson['main'], s => Utils.trimAdjustString(s, undefined, undefined, undefined, undefined));
				if (mainFiles && (mainFiles.length > 0)) {
					this.plugin.packageMainFiles[packageName] = mainFiles;
					return mainFiles;
				} else {
					Utils.log(LogType.Warning,
						'Main files not found in .bower.json! (export: \'{0}\', package: \'{1}\')',
						exportName, packageName);
					return Utils.rejectedPromise<string[]>();
				}
			});
	}

	/**
	 * Returns this rule's stream
	 */
	public createStream(context: IExecutionContext): NodeJS.ReadableStream {
		var cwd = path.join(this.plugin.options.cwd,
			path.join(this.plugin.bowerComponentsDirectory, context.packageName));
		var base = path.join(this.plugin.options.cwd,
			path.join(this.plugin.bowerComponentsDirectory, context.packageName));
		var src = this.resolvedSrc[context.packageName];
		var stream: NodeJS.ReadableStream;

		// Source Glob Stream
		try {
			stream = vinylSrc.src(src, { cwd: cwd, base: base, read: !this.plugin.options.nonReadableStreamedFiles });
			stream['name'] = context.exportInstance.name + ' - ' + context.packageName + ' - SOURCE';
			return stream;
		} catch (e) {
			Utils.log(LogType.Error,
				'Failed creating source glob stream (export: \'{0}\', package: \'{1}\', src: \'{2}\')',
				context.exportInstance.name, context.packageName, src);
			return null;
		}
	}
}

/**
 * Name Filter Rule
 */
class FilterRule {
	public plugin: BowerExportsPlugin;
	public type: RuleType = RuleType.Filter;
	public id: string;

	public fullnameLike: string;
	public dirnameLike: string;
	public filenameLike: string;
	public basenameLike: string;
	public extnameLike: string;

	/**
	 * Constructor
	 */
	constructor(plugin: BowerExportsPlugin, data: IFilterRule) {
		this.plugin = plugin;
		this.id = data.id;

		this.fullnameLike = Utils.trimAdjustString(data.fullnameLike, null, null, null, null);
		this.dirnameLike = Utils.trimAdjustString(data.dirnameLike, null, null, null, null);
		this.filenameLike = Utils.trimAdjustString(data.filenameLike, null, null, null, null);
		this.basenameLike = Utils.trimAdjustString(data.basenameLike, null, null, null, null);
		this.extnameLike = Utils.trimAdjustString(data.extnameLike, null, null, null, null);
	}

	/**
	 * Whether this instance is valid
	 */
	public get valid(): boolean {
		return !!this.fullnameLike || !!this.dirnameLike
			|| !!this.filenameLike || !!this.basenameLike
			|| !!this.extnameLike;
	}

	/**
	 * Returns this rule's stream
	 */
	public createStream(context: IExecutionContext): NodeJS.ReadWriteStream {
		return Utils.createTransform(Utils.proxy(this.transformObjects, this), null, context);
	}

	/**
	 * Transform
	 */
	private transformObjects(transformStream: stream.Transform, file: File, encoding: string, context: IExecutionContext): Q.Promise<any> {
		if ((!this.fullnameLike || Utils.testRegExp(Utils.toRegExp(this.plugin.replacePackageToken(this.fullnameLike, context.packageName), true), file.relative))
			&& (!this.filenameLike || Utils.testRegExp(Utils.toRegExp(this.plugin.replacePackageToken(this.filenameLike, context.packageName), true), path.basename(file.relative)))
			&& (!this.dirnameLike || Utils.testRegExp(Utils.toRegExp(this.plugin.replacePackageToken(this.dirnameLike, context.packageName), true), path.dirname(file.relative)))
			&& (!this.basenameLike || Utils.testRegExp(Utils.toRegExp(this.plugin.replacePackageToken(this.basenameLike, context.packageName), true), path.basename(file.relative, path.extname(file.relative))))
			&& (!this.extnameLike || Utils.testRegExp(Utils.toRegExp(this.plugin.replacePackageToken(this.extnameLike, context.packageName), true), path.extname(file.relative)))) {
			transformStream.push(file);
		}
		return Utils.resolvedPromise();
	}
}

/**
 * Rename Rule
 */
class RenameRule {
	public plugin: BowerExportsPlugin;
	public parent: Export;
	public type: RuleType = RuleType.Rename;
	public id: string;

	public replace: string;
	public in: FileNamePart;
	public with: string;

	/**
	 * Constructor
	 */
	constructor(plugin: BowerExportsPlugin, data: IRenameRule) {
		this.plugin = plugin;
		this.id = data.id;

		this.replace = Utils.trimAdjustString(data.replace, null, null, null, null);
		this.in = Utils.adjustEnumValue(data.in, FileNamePart.FileName, FileNamePart, false);
		this.with = Utils.trimAdjustString(data.with, null, null, null, '');
	}

	/**
	 * Whether this instance is valid
	 */
	public get valid(): boolean {
		return this.with !== null;
	}

	/**
	 * Returns this rule's stream
	 */
	public createStream(context: IExecutionContext): NodeJS.ReadWriteStream {
		return Utils.createTransform(Utils.proxy(this.transformObjects, this), null, context);
	}

	/**
	 * Transform
	 */
	private transformObjects(transformStream: stream.Transform, file: File, encoding: string, context: IExecutionContext): Q.Promise<any> {
		// Rename
		var replace = this.replace
			? Utils.toRegExp(this.plugin.replacePackageToken(this.replace, context.packageName), true)
			: new RegExp('^.*$', 'g');
		var withText = this.plugin.replacePackageToken(this.with, context.packageName);

		if (this.in === FileNamePart.FullName) {
			let name = file.relative;
			name = name.replace(replace, withText);
			Utils.setFilePath(file, name);
		} else if (this.in === FileNamePart.DirName) {
			let name = path.dirname(file.relative);
			name = name.replace(replace, withText);
			Utils.setFilePath(file, path.join(name, path.basename(file.relative)));
		} else if (this.in === FileNamePart.FileName) {
			let name = path.basename(file.relative);
			name = name.replace(replace, withText);
			Utils.setFilePath(file, path.join(path.dirname(file.relative), name));
		} else if (this.in === FileNamePart.BaseName) {
			let extname = path.extname(file.relative);
			let name = path.basename(file.relative, extname);
			name = name.replace(replace, withText);
			Utils.setFilePath(file, path.join(path.dirname(file.relative), name + extname));
		} else if (this.in === FileNamePart.ExtName) {
			let extname = path.extname(file.relative);
			let name = extname;
			name = name.replace(replace, withText);
			Utils.setFilePath(file, path.join(path.dirname(file.relative), path.basename(file.relative, extname) + name));
		}

		// Push
		return Utils.pushFiles(transformStream, [file]);
	}
}

/**
 * Replace Contents Rule
 */
class ReplaceContentRule {
	public plugin: BowerExportsPlugin;
	public type: RuleType = RuleType.ReplaceContent;
	public id: string;

	public replace: string;
	public with: string;

	/**
	 * Constructor
	 */
	constructor(plugin: BowerExportsPlugin, data: IReplaceContentRule) {
		this.plugin = plugin;
		this.id = data.id;

		this.replace = Utils.trimAdjustString(data.replace, null, null, null, null);
		this.with = Utils.trimAdjustString(data.with, null, null, null, '');
	}

	/**
	 * Whether this instance is valid
	 */
	public get valid(): boolean {
		return this.with !== null;
	}

	/**
	 * Returns this rule's stream
	 */
	public createStream(context: IExecutionContext): NodeJS.ReadWriteStream {
		return Utils.createTransform(Utils.proxy(this.transformObjects, this), null, context);
	}

	/**
	 * Transform
	 */
	private transformObjects(transformStream: stream.Transform, file: File, encoding: string, context: IExecutionContext): Q.Promise<any> {
		// Perform only if we have content
		if (!file.isNull()) {
			var originalContentIsBuffer = gUtil.isBuffer(file.contents);
			var replace = this.replace
				? Utils.toRegExp(this.plugin.replacePackageToken(this.replace, context.packageName), false)
				: new RegExp('^[\s\S]*$', 'g');
			var withText = this.plugin.replacePackageToken(this.with, context.packageName);

			// We need buffer to replace content
			return Utils.streamToBuffer(file.contents)
				.then(buffer => {
					try {
						// Get String
						var text = Utils.bufferToText(buffer);

						// Replace
						text = text.replace(replace, withText);
						buffer = new Buffer(text);

						// Set back
						if (originalContentIsBuffer) {
							file.contents = buffer;
						} else {
							file.contents = Utils.bufferToStream(buffer);
						}

						// Return
						transformStream.push(file);
						return Utils.resolvedPromise();
					} catch (e) {
						Utils.log(LogType.Error,
							'Failed to replace content (export: \'{0}\', package: \'{1}\', reason: \'{2}\')',
							context.exportInstance.name, context.packageName, e);
						return Utils.rejectedPromise();
					}
				});
		} else {
			// Push & skip
			transformStream.push(file);
			return Utils.resolvedPromise();
		}
	}
}

/**
 * Move Rule
 */
class MoveRule {
	public plugin: BowerExportsPlugin;
	public type: RuleType = RuleType.Move;
	public id: string;

	public to: string;
	public hierarchyAdjustment: HierarchyAdjustment;

	/**
	 * Constructor
	 */
	constructor(plugin: BowerExportsPlugin, data: IMoveRule) {
		this.plugin = plugin;
		this.id = data.id;

		this.to = Utils.trimAdjustString(data.to, null, null, null, null);
		this.hierarchyAdjustment = Utils.adjustEnumValue(data.withHierarchy, HierarchyAdjustment.None, HierarchyAdjustment, false);
	}

	/**
	 * Whether this instance is valid
	 */
	public get valid(): boolean {
		return !!this.to;
	}

	/**
	 * Returns this rule's stream
	 */
	public createStream(context: IExecutionContext): NodeJS.ReadWriteStream {
		// Clear
		context.moveFiles = [];

		// Transform
		var transform = Utils.createTransform(
			Utils.proxy(this.transformObjects, this),
			Utils.proxy(this.flushObjects, this),
			context);
		transform['name'] = context.exportInstance.name + ' - ' + context.packageName + ' - MOVE';
		return transform;
	}

	/**
	 * Collects the paths of the objects
	 */
	private transformObjects(transform: stream.Transform, file: File, encoding: string, context: IExecutionContext): Q.Promise<any> {
		if (!file.isDirectory()) {
			if (this.hierarchyAdjustment === HierarchyAdjustment.None) {
				let to = this.plugin.replacePackageToken(this.to, context.exportInstance.overridingMovePackageName, true);
				Utils.setFilePath(file, path.join(to, file.relative));
				transform.push(file);
			} else if (this.hierarchyAdjustment === HierarchyAdjustment.Flattened) {
				let to = this.plugin.replacePackageToken(this.to, context.exportInstance.overridingMovePackageName, true);
				Utils.setFilePath(file, path.join(to, path.basename(file.relative)));
				transform.push(file);
			} else {
				context.moveFiles.push(file);
			}
		}
		return Utils.resolvedPromise();
	}

	/**
	 * Pushes the objects
	 */
	private flushObjects(transform: stream.Transform, context: IExecutionContext): Q.Promise<any> {
		// If not minimized, return
		if (this.hierarchyAdjustment !== HierarchyAdjustment.Minimized) {
			return Utils.resolvedPromise();
		}

		// Adjust Hierarchy
		var commonPathSegment = Utils.findCommonSegment(
			Enumerable.from(context.moveFiles)
				.select(f => path.dirname(f.relative)).toArray());

		// Rebase all files
		Enumerable.from(context.moveFiles)
			.forEach(f => Utils.removeCommonPathSegment(f, commonPathSegment));

		// Move to
		var to = this.plugin.replacePackageToken(this.to, context.exportInstance.overridingMovePackageName, true);
		Enumerable.from(context.moveFiles)
			.forEach(f => Utils.setFilePath(f, path.join(to, f.relative)));

		// Now write the files
		return Utils.pushFiles(transform, context.moveFiles);
	}
}

/**
 * Check Changes
 */
class CheckChangesRule {
	public plugin: BowerExportsPlugin;
	public type: RuleType = RuleType.CheckChanges;
	public id: string;

	private _isValid: boolean;
	public hasChanged: Function;
	public extension: string;

	/**
	 * Constructor
	 */
	constructor(plugin: BowerExportsPlugin, data: ICheckChangesRule) {
		this.plugin = plugin;
		this.id = data.id;
		this._isValid = true;

		this.extension = Utils.trimAdjustString(data.extension, null, null, null, null);

		var hasChanged = Utils.trimAdjustString(data.hasChanged, null, null, null, null);
		this.hasChanged = null;
		if (hasChanged) {
			try {
				this.hasChanged = eval(hasChanged);
				if (!Utils.isType(this.hasChanged, Function)) {
					this.hasChanged = null;
					throw new Error('The function specified for hasChanged does not exist or is not valid');
				}
			} catch (e) {
				Utils.log(LogType.Error,
					'Failed to parse \'hasChanged\' (rule: \'{0}\', type: \'{1}\', reason: \'{2}\')',
					this.id, RuleType[this.type], e);
				this._isValid = false;
			}
		}
	}

	/**
	 * Whether this instance is valid
	 */
	public get valid(): boolean {
		return this._isValid
			&& (this.plugin.options.checkChangesDestination !== null);
	}

	/**
	 * Returns this rule's stream
	 */
	public createStream(context: IExecutionContext): NodeJS.ReadWriteStream {
		// gulp-changed Options
		var gChangedOptions: any = {};

		// Extension
		if (this.extension) {
			gChangedOptions.extension = this.extension;
		}
		if (this.hasChanged) {
			gChangedOptions.hasChanged = this.hasChanged;
		}

		// Return
		return gChanged(this.plugin.options.checkChangesDestination, gChangedOptions);
	}
}

/**
 * Export Directive
 */
class Export {
	public plugin: BowerExportsPlugin;

	private _isValid: boolean;
	public name: string;
	public packageNames: string[];
	public source: SourceRule;
	public filter: FilterRule[];
	public rename: RenameRule[];
	public replaceContent: ReplaceContentRule[];
	public move: MoveRule;
	public overridingMovePackageName: string;
	public hierarchyAdjustment: HierarchyAdjustment;
	public ifChanged: CheckChangesRule[];

	/**
	 * Constructor
	 */
	constructor(plugin: BowerExportsPlugin, data: IExport, defaultRules: IDefaultRules, includeRules: IIncludeRules) {
		this.plugin = plugin;

		this.name = Utils.trimAdjustString(data.name, null, null, null, null);
		this._isValid = true;

		var from: any = Utils.trimAdjustString(data.from, null, null, null, null);
		from = from ? from.split(',') : from;
		this.packageNames = Enumerable.from(Utils.ensureArray(from, s => {
			s = Utils.trimAdjustString(s, null, null, null, null);
			if (!s) {
				return undefined;
			}

			var regex = Utils.toRegExp(s, true);
			if (!regex) {
				Utils.log(LogType.Error,
					'Failed to convert string to RegExp (export: \'{0}\', src: \'{1}\')',
					this.name, s);
				this._isValid = false;
				return undefined;
			}

			return Enumerable.from(plugin.packageNames)
				.where(p => Utils.testRegExp(regex, p))
				.toArray();
		}) || []).distinct().toArray();

		var source: any = Utils.trimAdjustString(data.select, defaultRules.source, defaultRules.source, defaultRules.source, '');
		source = (source || '').split(',');
		source.push(includeRules.source);
		var sourceRules = Utils.ensureArray(source, s => {
			s = Utils.trimAdjustString(s, null, null, null, null);
			if (!s) { return undefined; }

			if (s === '#main#') {
				return new SourceRule(plugin, {
					id: Utils.generateUniqueRuleId(RuleType.Source),
					type: RuleType[RuleType.Source].toLowerCase(),
					src: s
				});
			} else if (s.indexOf('#') === 0) {
				return plugin.resolveRule<SourceRule>(s.substr(1), RuleType.Source) || undefined;
			} else {
				return new SourceRule(plugin, {
					id: Utils.generateUniqueRuleId(RuleType.Source),
					type: RuleType[RuleType.Source].toLowerCase(),
					src: s
				});
			}
		}) || [];
		if (sourceRules.length === 0) {
			this.source = null;
		} else if (sourceRules.length === 1) {
			this.source = sourceRules[0];
		} else {
			this.source = new SourceRule(plugin, {
				id: Utils.generateUniqueRuleId(RuleType.Source),
				type: RuleType[RuleType.Source].toLowerCase(),
				src: Enumerable.from(sourceRules).selectMany(s => s.src || []).toJoinedString(',')
			});
		}
		if (this.source && !this.source.valid) {
			Utils.log(LogType.Error,
				'Invalid source expressions encountered (export: \'{0}\', src: \'{1}\')',
				this.name, this.source.src);
			this._isValid = false;
			this.source = null;
		}

		var filter: any = Utils.trimAdjustString(data.filter, defaultRules.filter, defaultRules.filter, defaultRules.filter, '');
		filter = (filter || '').split(',');
		filter.push(includeRules.filter);
		this.filter = Utils.ensureArray(filter, s => {
			s = Utils.trimAdjustString(s, null, null, null, null);
			if (!s) {
				return undefined;
			}

			if (s.indexOf('#') === 0) {
				return plugin.resolveRule<FilterRule>(s.substr(1), RuleType.Filter) || undefined;
			}
			var rule = new FilterRule(plugin, {
				id: Utils.generateUniqueRuleId(RuleType.Filter),
				type: RuleType[RuleType.Filter].toLowerCase(),
				fullnameLike: s
			});
			if (!rule.valid) {
				Utils.log(LogType.Error,
					'Invalid filter expression encountered (export: \'{0}\', src: \'{1}\')',
					this.name, s);
				this._isValid = false;
				rule = undefined;
			}
			return rule;
		}) || [];

		var rename: any = Utils.trimAdjustString(data.rename, defaultRules.rename, defaultRules.rename, defaultRules.rename, '');
		rename = (rename || '').split(',');
		rename.push(includeRules.rename);
		this.rename = Utils.ensureArray(rename, s => {
			s = Utils.trimAdjustString(s, null, null, null, null);
			if (!s) {
				return undefined;
			}

			if (s.indexOf('#') === 0) {
				return plugin.resolveRule<RenameRule>(s.substr(1), RuleType.Rename) || undefined;
			}
			var rule = new RenameRule(plugin, {
				id: Utils.generateUniqueRuleId(RuleType.Rename),
				type: RuleType[RuleType.Rename].toLowerCase(),
				with: s
			});
			if (!rule.valid) {
				Utils.log(LogType.Error,
					'Invalid rename expression encountered (export: \'{0}\', src: \'{1}\')',
					this.name, s);
				this._isValid = false;
				rule = undefined;
			}
			return rule;
		}) || [];

		var replaceContent: any = Utils.trimAdjustString(data.replaceContent, defaultRules.replaceContent, defaultRules.replaceContent, defaultRules.replaceContent, '');
		replaceContent = (replaceContent || '').split(',');
		replaceContent.push(includeRules.replaceContent);
		this.replaceContent = Utils.ensureArray(replaceContent, s => {
			s = Utils.trimAdjustString(s, null, null, null, null);
			if (!s) {
				return undefined;
			}

			if (s.indexOf('#') === 0) {
				return plugin.resolveRule<ReplaceContentRule>(s.substr(1), RuleType.ReplaceContent) || undefined;
			}
			var rule = new ReplaceContentRule(plugin, {
				id: Utils.generateUniqueRuleId(RuleType.ReplaceContent),
				type: RuleType[RuleType.ReplaceContent].toLowerCase(),
				with: s
			});
			if (!rule.valid) {
				Utils.log(LogType.Error,
					'Invalid replace expression encountered (export: \'{0}\', src: \'{1}\')',
					this.name, s);
				this._isValid = false;
				rule = undefined;
			}
			return rule;
		}) || [];

		this.move = null;
		var move = Utils.trimAdjustString(data.move, defaultRules.move, defaultRules.move, defaultRules.move, null);
		if (move) {
			if (move.indexOf('#') === 0) {
				this.move = plugin.resolveRule<MoveRule>(move.substr(1), RuleType.Move);
			} else {
				this.move = new MoveRule(plugin, {
					id: Utils.generateUniqueRuleId(RuleType.Move),
					type: RuleType[RuleType.Move].toLowerCase(),
					to: move
				});
				if (!this.move.valid) {
					Utils.log(LogType.Error,
						'Invalid move expression encountered (export: \'{0}\', src: \'{1}\')',
						this.name, move);
					this._isValid = false;
					this.move = null;
				}
			}
		}

		this.overridingMovePackageName = Utils.trimAdjustString(data.overridingMovePackageName, null, null, null, '');

		this.hierarchyAdjustment = Utils.adjustEnumValue(data.withHierarchy, null, HierarchyAdjustment, false);
		if (this.hierarchyAdjustment === null) {
			this.hierarchyAdjustment = Utils.adjustEnumValue(defaultRules.hierarchyAdjustment, null, HierarchyAdjustment, false);
		}
		if (this.move && (this.hierarchyAdjustment !== null)) {
			this.move.hierarchyAdjustment = this.hierarchyAdjustment;
		}

		var ifChanged: any = Utils.trimAdjustString(data.ifChanged, defaultRules.changeCheckers, defaultRules.changeCheckers, defaultRules.changeCheckers, null);
		ifChanged = (ifChanged || '').split(',');
		ifChanged.push(includeRules.changeCheckers);
		this.ifChanged = Utils.ensureArray(ifChanged, s => {
			s = Utils.trimAdjustString(s, null, null, null, null);
			if (!s) {
				return undefined;
			}

			if (s.indexOf('#') === 0) {
				return plugin.resolveRule<CheckChangesRule>(s.substr(1), RuleType.CheckChanges) || undefined;
			} else {
				Utils.log(LogType.Error,
					'Invalid check changes expression encountered (export: \'{0}\', src: \'{1}\')',
					this.name, s);
				this._isValid = false;
				return undefined;
			}
		}) || [];
	}

	/**
	 * Whether this instance is valid
	 */
	public get valid(): boolean {
		return this._isValid
			&& !!this.packageNames
			&& (this.packageNames.length > 0)
			&& !!this.source;
	}

	/**
	 * Resolves the source patterns
	 */
	public resolve(): Q.Promise<any> {
		return this.source.resolve(this.packageNames, this.name);
	}

	/**
	 * Creates the export stream for the specified package name
	 */
	public createStream(packageName: string): NodeJS.ReadableStream {
		// Check valid
		if (!Enumerable.from(this.packageNames).contains(packageName)) {
			return null;
		}

		// Execution Context
		var context = {
			exportInstance: this,
			packageName: packageName,
			sourceFiles: [],
			moveFiles: []
		};

		// Combined Source Stream
		var stream: NodeJS.ReadableStream = this.source.createStream(context);
		if (!stream) {
			return null;
		}

		// Pass it through filters
		Enumerable.from(this.filter).where(f => f.valid).forEach(f => stream = stream.pipe(f.createStream(context)));

		// Rename Rules
		Enumerable.from(this.rename).where(r => r.valid).forEach(r => stream = stream.pipe(r.createStream(context)));

		// Replace Content Rules
		Enumerable.from(this.replaceContent).where(r => r.valid).forEach(r => stream = stream.pipe(r.createStream(context)));

		// Move rule
		if (this.move && this.move.valid) {
			stream = stream.pipe(this.move.createStream(context));
		}

		// Check Changes
		Enumerable.from(this.ifChanged).where(r => r.valid).forEach(r => stream = stream.pipe(r.createStream(context)));

		// Pipe the package streams into the transform
		stream['name'] = this.name + ' - ' + packageName;
		return stream;
	}
}

/**
 * Primary Plugin
 */
class BowerExportsPlugin {
	public static PluginName: string = 'gulp-bower-exports';
	public static MainSrcToken: string = '#main#';
	public static MainSrcTokenRegex: RegExp = Utils.toRegExp(BowerExportsPlugin.MainSrcToken, true);
	public static PackageNameToken: string = "#package#";
	public static PackageNameTokenRegex: RegExp = Utils.toRegExp(BowerExportsPlugin.PackageNameToken, false);
	public static TransformStreamReadableHighWaterMark = 64;

	public options: IOptions;
	public packageNames: string[];
	public bowerComponentsDirectory: string;
	public packageMainFiles: { [key: string]: string[] };

	public rules: Rule[];
	public exports: Export[];

	private _streamFactoryQueue: ReadableStreamCreator[];

	/**
	 * Constructor
	 * @param options - Options for the plugin
	 */
	constructor(options?: IOptions) {
		var cwd = process.cwd();

		this.options = {};
		options = options || {};

		this.options.cwd = Utils.trimAdjustString(options.cwd, cwd, cwd, cwd, cwd);
		this.options.externalExportsJsonFilePath = Utils.trimAdjustString(options.externalExportsJsonFilePath, null, null, null, null);
		this.options.bowerRcFilePath = Utils.trimAdjustString(options.bowerRcFilePath, null, null, null, null);
		this.options.bowerComponentsDirectory = Utils.trimAdjustString(options.bowerComponentsDirectory, null, null, null, null);
		this.options.passThroughSourceFiles = !!options.passThroughSourceFiles;
		this.options.nonReadableStreamedFiles = !!options.nonReadableStreamedFiles;
		this.options.checkChangesDestination = Utils.trimAdjustString(options.checkChangesDestination, null, null, null, null);
	}

	/**
	 * Main exported function
	 * @param options - Plugin options
	 */
	public static bowerExports(options?: IOptions): stream.Transform {
		// Wait if being debugged
		debugger;

		// Create instance
		var pluginInstance = new BowerExportsPlugin(options);

		// Return init stream
		return Utils.createTransform(Utils.proxy(pluginInstance.initializationTransform, pluginInstance));
	}

	/**
	 * Creates streams on demans
	 * @param callback - Callback to return the streams
	 */
	private exportsStreamFactory(callback: (e: any, stream: NodeJS.ReadableStream) => void): void {
		if (!this._streamFactoryQueue) {
			var creator: ((xx: Export, pp: string, ii: number, jj: number) => ReadableStreamCreator) = (xx: Export, pp: string, ii: number, jj: number) => {
				Utils.log(LogType.Information, 'Processing \'{0}\' - \'{1}\'...', xx.name, pp);
				return () => xx.createStream(pp);
			};

			this._streamFactoryQueue = [];
			for (var i = 0; i < this.exports.length; ++i) {
				var x = this.exports[i];
				for (var j = 0; j < x.packageNames.length; ++j) {
					var p = x.packageNames[j];
					this._streamFactoryQueue.push(creator(x, p, i, j));
				}
			}
		}

		// If we have exports, pass it on
		if (this._streamFactoryQueue.length > 0) {
			// Create next stream
			var stream = this._streamFactoryQueue.shift()();
			if (!stream) {
				callback(new Error('An unknown error has occurred'), null);
			} else {
				callback(null, stream);
			}
		} else {
			// No more exports end
			callback(null, null);
		}
	}

	/**
	 * Initializes the context from the bower.json file flowing in
	 */
	private initializationTransform(transform: stream.Transform, file: File, encoding: string): Q.Promise<any> {
		// Read file contents
		return Utils.streamToBuffer(file.contents)

			// Parse as JSON
			.then(buffer => Utils.parseJson<IBowerJson>(buffer))

			// Load Exports
			.then((bowerJson: IBowerJson) => {
				// Get all package names
				this.packageNames = Enumerable.from(Utils.getProperties(bowerJson.dependencies))
					.select(p => Utils.trimAdjustString(p.key, null, null, null, null))
					.where(p => !!p)
					.toArray();

				// Reject if no package names
				if (this.packageNames.length === 0) {
					Utils.log(LogType.Warning,
						'No packages found in the bower.json dependencies (path: \'{0}\')',
						file.path);
					return Utils.rejectedPromise();
				}

				// Check external exports file
				if (this.options.externalExportsJsonFilePath) {
					return Utils.readJson<IBowerExports>(this.options.externalExportsJsonFilePath);
				} else if (bowerJson.bowerExports) {
					return Utils.resolvedPromise(bowerJson.bowerExports);
				} else {
					return Utils.rejectedPromise(new Error('Bower Exports section not found'));
				}
			})

			// Check bower_components directory
			.then((b: IBowerExports) => {
				// Create rules
				this.rules = Utils.ensureArray<IRule, Rule>(b.rules, r => {
					// Check if we have the rule
					if (!r) {
						return undefined;
					}

					// All elements are required to have id
					r.id = Utils.trimAdjustString(r.id, null, null, null, null);
					r.type = Utils.trimAdjustString(r.type, null, null, null, null);
					if (!r.id || !r.type) {
						return undefined;
					}

					// Rule type
					var ruleType = Utils.adjustEnumValue(r.type, null, RuleType, false);
					if (ruleType === null) {
						return undefined;
					}

					try {
						// Create rule
						if (ruleType === RuleType.Source) {
							var sourceRule = new SourceRule(this, <ISourceRule>r);
							return sourceRule.valid ? sourceRule : undefined;
						} else if (ruleType === RuleType.Filter) {
							var nameFilterRule = new FilterRule(this, <IFilterRule>r);
							return nameFilterRule.valid ? nameFilterRule : undefined;
						} else if (ruleType === RuleType.Rename) {
							var renameRule = new RenameRule(this, <IRenameRule>r);
							return renameRule.valid ? renameRule : undefined;
						} else if (ruleType === RuleType.ReplaceContent) {
							var replaceContentRule = new ReplaceContentRule(this, <IReplaceContentRule>r);
							return replaceContentRule.valid ? replaceContentRule : undefined;
						} else if (ruleType === RuleType.Move) {
							var moveRule = new MoveRule(this, <IMoveRule>r);
							return moveRule.valid ? moveRule : undefined;
						} else if (ruleType === RuleType.CheckChanges) {
							var checkChangesRule = new CheckChangesRule(this, <ICheckChangesRule>r);
							return checkChangesRule.valid ? checkChangesRule : undefined;
						}
					} catch (e) {
						Utils.log(LogType.Warning,
							'Rule instance could not be created (src: \'{0}\', reason: \'{1}\')', r, e);
					}
					return undefined;
				});
				if ((this.rules === null) || (this.rules.length === 0)) {
					return Utils.rejectedPromise<string>(
						new Error('No valid rules present in the bower exports'));
				}

				// Check for duplicate ids
				var rulesEnum = Enumerable.from(this.rules);
				var typeGroups = rulesEnum.groupBy(r => r.type);
				var duplicatesFound = false;
				typeGroups.forEach(g => {
					Enumerable.from(g).forEach((r, i) => {
						var loggedIds = {};
						Enumerable.from(g).forEach((r1, i1) => {
							if ((r.id === r1.id) && (i !== i1)) {
								duplicatesFound = true;
								if (!loggedIds[r.id]) {
									Utils.log(LogType.Error,
										'Duplicate rule id found (id: \'{0}\', type: \'{1}\')',
										r.id, RuleType[g.key()]);
								}
								loggedIds[r.id] = true;
							}
						});
					});
				});
				if (duplicatesFound) {
					return Utils.rejectedPromise<string>();
				}

				// Default & Include Rules
				var defaultRules = b.defaultRules || {};
				var includeRules = b.includeRules || {};

				defaultRules.source = Utils.trimAdjustString(defaultRules.source, null, null, null, null);
				defaultRules.filter = Utils.trimAdjustString(defaultRules.filter, null, null, null, null);
				defaultRules.rename = Utils.trimAdjustString(defaultRules.rename, null, null, null, null);
				defaultRules.replaceContent = Utils.trimAdjustString(defaultRules.replaceContent, null, null, null, null);
				defaultRules.move = Utils.trimAdjustString(defaultRules.move, null, null, null, null);
				defaultRules.hierarchyAdjustment = Utils.trimAdjustString(defaultRules.hierarchyAdjustment, null, null, null, null);
				defaultRules.changeCheckers = Utils.trimAdjustString(defaultRules.changeCheckers, null, null, null, null);

				includeRules.source = Utils.trimAdjustString(includeRules.source, null, null, null, null);
				includeRules.filter = Utils.trimAdjustString(includeRules.filter, null, null, null, null);
				includeRules.rename = Utils.trimAdjustString(includeRules.rename, null, null, null, null);
				includeRules.replaceContent = Utils.trimAdjustString(includeRules.replaceContent, null, null, null, null);
				includeRules.changeCheckers = Utils.trimAdjustString(includeRules.changeCheckers, null, null, null, null);

				// Create Export Objects
				this.exports = Utils.ensureArray(b.exports, x => {
					if (!x) { return undefined; }
					var xObj = new Export(this, x, defaultRules, includeRules);
					return xObj.valid ? xObj : undefined;
				});
				if ((this.exports === null) || (this.exports.length === 0)) {
					return Utils.rejectedPromise<string>(
						new Error('No valid exports present in the bower exports'));
				}
				Enumerable.from(this.exports).forEach((x, i) => x.name = x.name || ('Export ' + (i + 1)));

				// Check bower_components folder
				var bCompsPromise = Utils.resolvedPromise<string>(null);

				// options.bowerComponentsDirectory
				return bCompsPromise.then(p => {
						if (!p && this.options.bowerComponentsDirectory) {
							return Utils.fileOrDirectoryExists(this.options.bowerComponentsDirectory);
						} else {
							return Utils.resolvedPromise(p);
						}
					})

					// Check options.bowerRcFilePath
					.then(p => {
						if (!p) {
							var bowerRcFilePathSpecified = !!this.options.bowerRcFilePath;
							var bowerRcFilePath = this.options.bowerRcFilePath || path.join(path.dirname(file.path), '.bowerrc');
							return Utils.readJson<IBowerRc>(bowerRcFilePath)
								.then(rc => {
									var dir = Utils.trimAdjustString(rc.directory, null, null, null, null);
									if (dir) {
										return Utils.fileOrDirectoryExists(dir);
									} else {
										return Utils.rejectedPromise<string>(
											new Error('The specified .bowerrc file does not contain the path of bower_components'));
									}
								})
								.catch(e => {
									if (bowerRcFilePathSpecified) {
										return Utils.rejectedPromise<string>(e);
									} else {
										return Utils.resolvedPromise(p);
									}
								});
						} else {
							return Utils.resolvedPromise(p);
						}
					})

					// Check bower_components in the current directory
					.then(p => {
						if (!p) {
							return Utils.fileOrDirectoryExists(path.join(path.dirname(file.path), 'bower_components'));
						} else {
							return Utils.resolvedPromise(p);
						}
					});
			})

			// Ready to Resolve Src
			.then(p => {
				// Save bower components directory
				this.bowerComponentsDirectory = p;

				// Resolve all export rule src
				this.packageMainFiles = {};
				return Q.all(Enumerable.from(this.exports).select(x => x.resolve()).toArray());
			})

			// Ready to transform
			.then(() => {
				// Push the file & finish
				if (this.options.passThroughSourceFiles) {
					Utils.pushFiles(transform, [file]);
				}

				// Stream Export Streams
				var exportsStream = multistream(Utils.proxy(this.exportsStreamFactory, this),
					{ objectMode: true, highWaterMark: BowerExportsPlugin.TransformStreamReadableHighWaterMark });

				// We are done when exportsStream is done
				return Utils.transferFiles(exportsStream, transform);
			})
			.catch(e => {
				// Log
				if (e) {
					Utils.log(LogType.Error,
						'Initialization failed (src: \'{0}\', reason: \'{1}\')',
						file.path, e);
				}

				// Return
				return Utils.rejectedPromise();
			});
	}

	/**
	 * Returns the rule instance
	 * @param id - Id of the rule
	 * @param ruleType - Rule type
	 * @returns {TRule} - Rule instance
	 */
	public resolveRule<TRule extends Rule>(id: string, ruleType: RuleType): TRule {
		return <TRule><any>Enumerable.from(this.rules)
			.singleOrDefault(r => (r.type === ruleType) && (r.id === id));
	}

	/**
	 * Replaces package token iin the given string
	 * @param str - String to replace in
	 * @param isPathString - Whether the specified string is a path segment
	 * @param packageNameOverride - Override for package name
	 * @returns {string} - Replaced string
	 */
	public replacePackageToken(str: string, packageName: string, isPathString: boolean = false): string {
		if (!Utils.isType(str, String)) {
			return str;
		}

		var packageName = Utils.isType(packageName, String) ? packageName : '';
		str = str.replace(BowerExportsPlugin.PackageNameTokenRegex, packageName);

		if (isPathString) {
			str = path.normalize(str).replace(/\\/g, '/');
		}
		return str;
	}
}

// Export
// ReSharper disable once CommonJsExternalModule
module.exports = BowerExportsPlugin.bowerExports;