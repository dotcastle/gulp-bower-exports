import fs = require('fs');
import path = require('path');
import stream = require('stream');
import Q = require('q');
import File = require('vinyl');
import Enumerable = require('linq');
import gUtil = require('gulp-util');
import {PluginError} from 'gulp-util';
import {StringDecoder} from 'string_decoder';
import LogType = require('./types/log-type');
import Constants = require('./constants');
import RuleType = require('./types/rule-type');
import Logger = require('./logger');

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
			return checkType('undefined') || typesEnum.any(p => typeof (p) === 'undefined');
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
				if (typeof (t) === 'string') {
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
		if (typeof (str) === 'undefined') {
			return undefinedValue;
		} else if (str === null) {
			return nullValue;
		} else if (typeof (str) !== 'string') {
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
		} else if (typeof (obj) === 'string') {
			return <string>obj;
		}

		// Try getting from toString
		var hasStr = false;
		var str: string = null;
		try {
			// ReSharper disable once QualifiedExpressionMaybeNull
			str = obj.toString();

			// Check if the text is the default one
			if (Utils.isType(str, String) && (str !== '[object Object]')) {
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
		if (Constants.isDebug) {
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
	 * Replaces braced patterns in the source glob
	 * @param src - Source glob
	 * @returns {string} - Replaced source glob
	 */
	public static replaceBracedGlobPatterns(src: string): string {
		if (!Utils.isType(src, String)) {
			return src;
		}
		var regex = /\{.+\}/g;
		if (Utils.testRegExp(regex, src)) {
			src = src.replace(regex, m => {
				var innerContent = Utils.replaceBracedGlobPatterns(m.substr(1, m.length - 2));
				var parts = innerContent.split(',');
				return '@(' + Enumerable.from(parts).toJoinedString('|') + ')';
			});
		}
		return src;
	}

	/**
	 * Sets file's path
	 * @param file - File
	 * @param relativePath - Relative path
	 */
	public static setFilePath(file: File, relativePath: string): void {
		file.path = path.normalize(path.join(file.base, relativePath));
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
			Logger.log(LogType.Warning,
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
		try { fileInfo.isBuffer = file.isBuffer(); } catch (e) { }
		try { fileInfo.isStream = file.isStream(); } catch (e) { }
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
	 * Creates a plugin error instance
	 */
	public static pluginError(err: Error | PluginError): PluginError {
		err = err || new Error('An unknown error has occurred');
		return (err instanceof PluginError) ? err : new PluginError(Constants.pluginName, <Error>err, {
			showStack: Constants.isDebug,
			showProperties: Constants.isDebug
		});
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
		transformOptions.highWaterMark = Constants.transformStreamReadableHighWaterMark;

		// https://nodejs.org/api/stream.html#stream_transform_transform_chunk_encoding_callback
		transformOptions.transform = (file: File, encoding: string, callback: (err?: Error, data?: any) => void) => {
			try {
				transformMethod(transformStream, file, encoding, data)
					.then(() => { callback(); })
					.catch(e => { callback(Utils.pluginError(e)); });
			} catch (e) { callback(Utils.pluginError(e)); }
		};

		if (flushMethod) {
			transformOptions.flush = (callback: (e?: any) => void) => {
				try {
					flushMethod(transformStream, data)
						.then(() => callback())
						.catch(e => callback(Utils.pluginError(e)));
				} catch (e) { callback(Utils.pluginError(e)); }
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
					Logger.log(LogType.Error,
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
	 * @param filePath - Path of the file
	 * @param cwd - Current working directory
	 * @param encoding - Option string encoding
	 * @returns {Q.Promise<string | Buffer>} - If encoding is specified, string data is returned.
	 *		Else raw buffer is returned.
	 */
	public static readFile(filePath: string, cwd?: string, encoding?: string): Q.Promise<string | Buffer> {
		var deferred = Q.defer<string | Buffer>();

		var processCwd = process.cwd();
		cwd = Utils.trimAdjustString(cwd, processCwd, processCwd, processCwd, processCwd);
		encoding = Utils.trimAdjustString(encoding, 'utf-8', 'utf-8', 'utf-8', 'utf-8');
		var adjustedPath = Utils.trimAdjustString(filePath, null, null, null, null);

		if (adjustedPath === null) {
			deferred.reject(new Error('File or directory \'' + Utils.toStr(filePath) + '\' is not valid'));
		} else {
			adjustedPath = path.resolve(cwd, adjustedPath);
			fs.readFile(adjustedPath, encoding, (err: Error, data: any) => {
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
	 * @param filePath - Path of the file
	 * @param cwd: Current working directory
	 * @param encoding - Option string encoding
	 * @returns {Q.Promise<string | Buffer>} - If encoding is specified, string data is returned.
	 *		Else raw buffer is returned.
	 */
	public static readText(filePath: string, cwd?: string, encoding?: string): Q.Promise<string> {
		var deferred = Q.defer<string>();

		var processCwd = process.cwd();
		cwd = Utils.trimAdjustString(cwd, processCwd, processCwd, processCwd, processCwd);
		encoding = Utils.trimAdjustString(encoding, 'utf-8', 'utf-8', 'utf-8', 'utf-8');
		var adjustedPath = Utils.trimAdjustString(filePath, null, null, null, null);

		if (adjustedPath === null) {
			deferred.reject(new Error('File or directory \'' + Utils.toStr(filePath) + '\' is not valid'));
		} else {
			adjustedPath = path.resolve(cwd, adjustedPath);
			fs.readFile(adjustedPath, encoding, (err: Error, data: any) => {
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
	 * @param cwd - Current working directory
	 * @param encoding - Option string encoding
	 * @returns {Q.Promise<string | Buffer>} - If encoding is specified, string data is returned.
	 *		Else raw buffer is returned.
	 */
	public static readJson<T>(filePath: string, cwd?: string, encoding?: string): Q.Promise<T> {
		var deferred = Q.defer<T>();

		var processCwd = process.cwd();
		cwd = Utils.trimAdjustString(cwd, processCwd, processCwd, processCwd, processCwd);
		encoding = Utils.trimAdjustString(encoding, 'utf8', 'utf8', 'utf8', 'utf8');
		var adjustedPath = Utils.trimAdjustString(filePath, null, null, null, null);

		if (adjustedPath === null) {
			deferred.reject(new Error('File or directory \'' + Utils.toStr(filePath) + '\' is not valid'));
		} else {
			adjustedPath = path.resolve(cwd, adjustedPath);
			fs.readFile(adjustedPath, encoding, (err: Error, data: any) => {
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
	 * @param fileOrDirPath - Path
	 * @param cwd - Current working directory
	 */
	public static fileOrDirectoryExists(fileOrDirPath: string, cwd?: string): Q.Promise<string> {
		var deferred = Q.defer<string>();

		var processCwd = process.cwd();
		cwd = Utils.trimAdjustString(cwd, processCwd, processCwd, processCwd, processCwd);
		var adjustedPath = Utils.trimAdjustString(fileOrDirPath, null, null, null, null);

		if (adjustedPath === null) {
			deferred.reject(new Error('File or directory \'' + Utils.toStr(fileOrDirPath) + '\' is not valid'));
		} else {
			adjustedPath = path.resolve(cwd, adjustedPath);
			fs.exists(adjustedPath, exists => {
				if (exists) {
					deferred.resolve(fileOrDirPath);
				} else {
					deferred.reject(new Error('File or directory \'' + fileOrDirPath + '\' does not exist'));
				}
			});
		}
		return deferred.promise;
	}
}
export = Utils;