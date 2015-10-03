var fs = require('fs');
var path = require('path');
var stream = require('stream');
var gUtil = require('gulp-util');
var File = require('vinyl');
var vinylSrc = require('vinyl-fs');
var Q = require('q');
var Enumerable = require('linq');
var string_decoder_1 = require('string_decoder');
var multistream = require('multistream');
var gChanged = require('gulp-changed');
/**
 * Debug Flag
 */
var DEBUG = true;
/**
 * Rule type
 */
var RuleType;
(function (RuleType) {
    RuleType[RuleType["Source"] = 0] = "Source";
    RuleType[RuleType["Filter"] = 1] = "Filter";
    RuleType[RuleType["Rename"] = 2] = "Rename";
    RuleType[RuleType["ReplaceContent"] = 3] = "ReplaceContent";
    RuleType[RuleType["Move"] = 4] = "Move";
    RuleType[RuleType["CheckChanges"] = 5] = "CheckChanges";
})(RuleType || (RuleType = {}));
/**
 * File name part
 */
var FileNamePart;
(function (FileNamePart) {
    FileNamePart[FileNamePart["FullName"] = 0] = "FullName";
    FileNamePart[FileNamePart["DirName"] = 1] = "DirName";
    FileNamePart[FileNamePart["FileName"] = 2] = "FileName";
    FileNamePart[FileNamePart["BaseName"] = 3] = "BaseName";
    FileNamePart[FileNamePart["ExtName"] = 4] = "ExtName";
})(FileNamePart || (FileNamePart = {}));
/**
 * Log type
 */
var LogType;
(function (LogType) {
    LogType[LogType["Information"] = 0] = "Information";
    LogType[LogType["Success"] = 1] = "Success";
    LogType[LogType["Warning"] = 2] = "Warning";
    LogType[LogType["Error"] = 3] = "Error";
})(LogType || (LogType = {}));
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
/**
 * Utilities class
 */
var Utils = (function () {
    function Utils() {
    }
    /**
     * Checks if the object is of the specified type
     * @param obj - Object to test
     * @param types - Types to check against
     * @returns {boolean} - True if the object is of the specified type. False otherwise
     */
    Utils.isAnyType = function (obj) {
        var types = [];
        for (var _i = 1; _i < arguments.length; _i++) {
            types[_i - 1] = arguments[_i];
        }
        var objType = typeof (obj);
        var typesEnum = Enumerable.from(types);
        var checkType = function () {
            var allowedTypes = [];
            for (var _i = 0; _i < arguments.length; _i++) {
                allowedTypes[_i - 0] = arguments[_i];
            }
            return typesEnum.intersect(Enumerable.from(allowedTypes)).any();
        };
        if (objType === 'undefined') {
            return checkType('undefined') || typesEnum.any(function (p) { return typeof (p) === 'undefined'; });
        }
        else if (obj === null) {
            return checkType(null, 'null');
        }
        else if (objType === 'function') {
            return checkType(Function, 'function');
        }
        else if (objType === 'boolean') {
            return checkType(Boolean, 'boolean');
        }
        else if (objType === 'string') {
            return checkType(String, 'string');
        }
        else if (objType === 'number') {
            return checkType(Number, 'number');
        }
        else if (objType === 'object') {
            if (checkType(Object, 'object')) {
                return true;
            }
            return typesEnum.any(function (t) {
                // ReSharper disable once SuspiciousTypeofCheck
                if (typeof (t) === 'string') {
                    try {
                        return obj instanceof eval(t);
                    }
                    catch (e) {
                        return false;
                    }
                }
                return obj instanceof t;
            });
        }
        return false;
    };
    /**
     * Checks if the object is of the specified type
     * @param obj - Object to test
     * @param type - Type to check against
     * @returns {boolean} - True if the object is of the specified type. False otherwise
     */
    Utils.isType = function (obj, type) {
        return Utils.isAnyType(obj, type);
    };
    /**
     * Checks if the specified object is a string and non-empty
     * @param str - String to check
     * @param undefinedValue - Value to use if the specified string undefined
     * @param nullValue - Value to use if the specified string null
     * @param nonStringValue - Value to use if the specified value is not a string
     * @param emptyValue - Value to use if the specified string empty
     * @returns {string} - Adjusted string
     */
    Utils.trimAdjustString = function (str, undefinedValue, nullValue, nonStringValue, emptyValue) {
        // Check if valid
        if (typeof (str) === 'undefined') {
            return undefinedValue;
        }
        else if (str === null) {
            return nullValue;
        }
        else if (typeof (str) !== 'string') {
            return nonStringValue;
        }
        else if ((str = str.trim()).length === 0) {
            return emptyValue;
        }
        else {
            return str;
        }
    };
    /**
     * Creates a proxy for the specified function to run in the specified context
     * @param func - Function
     * @param context - Context
     * @returns {Function} - Proxy function
     */
    Utils.proxy = function (func, context) {
        // ReSharper disable once Lambda
        return (function () {
            return func.apply(context, arguments);
        });
    };
    /**
     * Converts an object to string
     * @param obj
     * @returns {string} String representing the object
     */
    Utils.toStr = function (obj, beautifySpaces) {
        if (beautifySpaces === void 0) { beautifySpaces = 0; }
        if (typeof (obj) === 'undefined') {
            return '<undefined>';
        }
        else if (obj === null) {
            return '<null>';
        }
        else if (typeof (obj) === 'string') {
            return obj;
        }
        // Try getting from toString
        var hasStr = false;
        var str = null;
        try {
            // ReSharper disable once QualifiedExpressionMaybeNull
            str = obj.toString();
            // Check if the text is the default one
            if (Utils.isType(str, String) && (str !== '[object Object]')) {
                hasStr = true;
            }
        }
        catch (e) { }
        // Try other methods if we do not have str
        if (!hasStr) {
            try {
                str = JSON.stringify(obj, null, beautifySpaces);
            }
            catch (e) {
                // ReSharper disable once QualifiedExpressionMaybeNull
                str = obj.toString() + ' (JSON.stringify failed (' + e.toString() + '). Using obj.toString)';
            }
        }
        // Append Stack Trace
        if (DEBUG) {
            if (obj['stack']) {
                str += ' (stacktrace: ' + Utils.toStr(obj['stack']) + ')';
            }
            else if (obj['stacktrace']) {
                str += ' (stacktrace: ' + Utils.toStr(obj['stacktrace']) + ')';
            }
        }
        return str;
    };
    /**
     * Creates a new unique id
     */
    Utils.generateUniqueRuleId = function (ruleType) {
        return RuleType[ruleType].toLowerCase() + '-' + new Date().getTime();
    };
    /**
     * Returns a resolved promise
     * @param result - Resolution result
     * @returns {Q.Promise<T>} - Resolved promise
     */
    Utils.resolvedPromise = function (result) {
        var deferred = Q.defer();
        deferred.resolve(result);
        return deferred.promise;
    };
    /**
     * Returns a rejected promise
     * @param result - Resolution result
     * @returns {Q.Promise<T>} - Resolved promise
     */
    Utils.rejectedPromise = function (e) {
        var deferred = Q.defer();
        deferred.reject(e);
        return deferred.promise;
    };
    /**
     * Transfers the promise to the specified deferred object
     * @param promise - Source promise
     * @param deferred - Destination deferred
     */
    Utils.transferPromise = function (promise, deferred) {
        promise.then(function (d) { return deferred.resolve(d); })
            .catch(function (e) { return deferred.reject(e); });
    };
    /**
     * Finds common segment in a set of strings
     */
    Utils.findCommonSegment = function (strs) {
        if (!Utils.isType(strs, Array)) {
            return null;
        }
        var strsEnum = Enumerable.from(strs).where(function (p) { return Utils.isType(p, String); });
        var itemCount = strsEnum.count();
        if (itemCount === 0) {
            return null;
        }
        var firstItem = strsEnum.first();
        if (itemCount === 1) {
            return firstItem;
        }
        var commonSegment = '';
        var minLength = strsEnum.min(function (p) { return p.length; });
        for (var i = 0; i < minLength; ++i) {
            var ch = firstItem[i];
            var allHaveSameCh = strsEnum.all(function (p) { return p[i] === ch; });
            if (allHaveSameCh) {
                commonSegment += ch;
            }
            else {
                break;
            }
        }
        return commonSegment;
    };
    /**
     * Removes the common path segment from the file
     */
    Utils.removeCommonPathSegment = function (file, commonPathSegment) {
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
            }
            else if (commonPathSegment.indexOf('.\\') === 0) {
                dir = '.\\' + dir;
            }
            Utils.setFilePath(file, path.join(dir, baseName));
        }
    };
    /**
     * Sets file's path
     * @param file - File
     * @param relativePath - Relative path
     */
    Utils.setFilePath = function (file, relativePath) {
        file.path = path.join(file.base, relativePath);
        if (file.sourceMap) {
            file.sourceMap.file = file.relative;
        }
    };
    /**
     * Escapes regex special characters
     * @returns {string} - Escaped string
     */
    Utils.escapeRegexCharacters = function (str) {
        return Utils.isType(str, String) ? str.replace(/[\\^$*+?.()|[\]{}]/g, '\\$&') : str;
    };
    /**
     * Converts a string to a Regex
     * @param obj - String of the format "\/\\.*\/gi" or a RegExp instance
     * @param strMatchTypeComplete - If the specified object is a string, whether to make the regex
     *		match the complete string
     * @returns {RegExp} - RegExp instance
     */
    Utils.toRegExp = function (obj, strMatchTypeComplete) {
        if (Utils.isType(obj, RegExp)) {
            return obj;
        }
        else if (Utils.isAnyType(obj, 'undefined', 'null')) {
            return null;
        }
        else if (typeof (obj) !== 'string') {
            var err = new Error(Utils.formatString('Invalid expression for RegExp conversion (specified: {0})', obj));
            throw err;
        }
        var str = obj;
        var trimmedStr = str.trim();
        var nextIndexOfSlash, pattern, flags;
        if ((trimmedStr.indexOf('/') === 0)
            && ((nextIndexOfSlash = trimmedStr.indexOf('/', 1)) >= 1)
            && (trimmedStr.indexOf('/', nextIndexOfSlash + 1) < 0)) {
            // This is a regex string
            pattern = trimmedStr.substr(1, nextIndexOfSlash - 1).trim();
            flags = trimmedStr.substr(nextIndexOfSlash + 1).trim() || 'g';
        }
        else {
            // This is a normal string
            pattern = (strMatchTypeComplete ? '^' : '')
                + Utils.escapeRegexCharacters(str)
                + (strMatchTypeComplete ? '$' : '');
            flags = 'g';
        }
        try {
            return new RegExp(pattern, flags);
        }
        catch (e) {
            Utils.log(LogType.Warning, 'Regex creation failed (pattern: {0}, flags: {1}, reason: {2})', pattern, flags, e);
            throw e;
        }
    };
    /**
     * Tests whether the str matches the pattern
     * http://stackoverflow.com/questions/1520800/why-regexp-with-global-flag-in-javascript-give-wrong-results
     */
    Utils.testRegExp = function (regExp, str) {
        if (!regExp || !Utils.isType(str, String)) {
            return false;
        }
        // Test & reset
        var result = regExp.test(str);
        regExp.lastIndex = 0;
        return result;
    };
    /**
     * Simple file info
     */
    Utils.toFileInfo = function (file) {
        var fileInfo = {};
        try {
            fileInfo.cwd = file.cwd;
        }
        catch (e) { }
        try {
            fileInfo.base = file.base;
        }
        catch (e) { }
        try {
            fileInfo.path = file.path;
        }
        catch (e) { }
        try {
            fileInfo.relative = file.relative;
        }
        catch (e) { }
        try {
            fileInfo.isNull = file.isNull();
        }
        catch (e) { }
        try {
            fileInfo.isDirectory = file.isDirectory();
        }
        catch (e) { }
        return fileInfo;
    };
    /**
     * Simple file info
     */
    Utils.toFileInfos = function (files) {
        return Enumerable.from(files).select(Utils.toFileInfo).toArray();
    };
    /**
     * Simple file info
     */
    Utils.toFile = function (fileInfo, createContents) {
        if (createContents === void 0) { createContents = true; }
        return new File({
            cwd: fileInfo.cwd,
            base: fileInfo.base,
            path: fileInfo.path,
            contents: createContents ? fs.readFileSync(fileInfo.path) : undefined
        });
    };
    /**
     * Simple file info
     */
    Utils.toFiles = function (fileInfos, createContents) {
        if (createContents === void 0) { createContents = true; }
        return Enumerable.from(fileInfos).select(function (f) { return Utils.toFile(f, createContents); }).toArray();
    };
    /**
     * Adjusts the given enum value to be valid
     * @param val - Value to adjust
     * @param defaultValue - Default value to return if val could not be converted
     * @param typeObject - Enum type
     * @param caseSensitive - Whether to use case sensitive comparisons
     * @returns {TType} - Converted value
     */
    Utils.adjustEnumValue = function (val, defaultValue, typeObject, caseSensitive) {
        // Default value if not valid
        if (!Utils.isAnyType(val, 'number', 'string')
            || ((typeof (val) === 'number') && isNaN(val))) {
            return defaultValue;
        }
        // Convert string to num
        if (typeof (val) === 'string') {
            var textVal = val.trim();
            if (textVal) {
                for (var prop in typeObject) {
                    if (typeObject.hasOwnProperty(prop)) {
                        if ((!caseSensitive && (textVal.toLowerCase() === prop.toString().toLowerCase()))
                            || (caseSensitive && (textVal === prop.toString()))) {
                            // Check if this is a number
                            var propNum = parseInt(prop);
                            if (!isNaN(propNum) && (propNum.toString() === prop.toString())
                                && (typeObject[typeObject[prop]] === prop)) {
                                return propNum;
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
            }
            else {
                return val;
            }
        }
        // Return Default
        return defaultValue;
    };
    /**
     * Gets all properties on the object
     * @param obj - Object to get properties from
     * @returns {IKeyValuePair<string, TValue>[]} - Key valie pair array
     */
    Utils.getProperties = function (obj) {
        if (Utils.isAnyType(obj, 'undefined', 'null')) {
            return [];
        }
        var arr = [];
        for (var prop in obj) {
            if (obj.hasOwnProperty(prop)) {
                arr.push({ key: prop, value: obj[prop] });
            }
        }
        return arr;
    };
    /**
     * Ensures that the specified data is an array. If the data is not an array, it is wrapped
     * in a new array instance, optionally removing invalid items in the array
     * @param data - Data
     * @param validator - Item validator
     * @returns {TOutput[]} - Data array
     */
    Utils.ensureArray = function (data, transformer) {
        if (typeof (data) === 'undefined') {
            return null;
        }
        if (!(data instanceof Array)) {
            data = [data];
        }
        var srcData = data;
        var resultData = [];
        transformer = Utils.isType(transformer, Function)
            ? transformer
            : (function (item, index) { return item; });
        for (var i = 0, n = srcData.length; i < n; ++i) {
            var outItems = transformer(srcData[i], i);
            // Undefined
            if (typeof (outItems) === 'undefined') {
                // Skip
                continue;
            }
            else if (outItems === null) {
                resultData.push(null);
                continue;
            }
            // Convert to array
            if (!(outItems instanceof Array)) {
                outItems = [outItems];
            }
            // Inject
            resultData = resultData.concat(Enumerable.from(outItems).where(function (p) { return !Utils.isType(p, 'undefined'); }).toArray());
        }
        return resultData;
    };
    /**
     * Formats the given string
     * @param format - String format
     * @param args - Argument list
     * @returns {string} - Formatted string
     */
    Utils.formatString = function (format) {
        var args = [];
        for (var _i = 1; _i < arguments.length; _i++) {
            args[_i - 1] = arguments[_i];
        }
        if (typeof (format) !== 'string') {
            return format;
        }
        args = args || [];
        Enumerable.from(args).forEach(function (a, i) {
            return format = format.replace(new RegExp('\\{' + i + '\\}', 'g'), Utils.toStr(a));
        });
        return format;
    };
    /**
     * Creates a transform
     */
    Utils.createTransform = function (transformMethod, flushMethod, data, transformOptions) {
        // https://nodejs.org/api/stream.html#stream_class_stream_transform_1
        var transformStream = null;
        transformOptions = transformOptions || {};
        transformOptions.objectMode = true;
        transformOptions.highWaterMark = BowerExportsPlugin.TransformStreamReadableHighWaterMark;
        // https://nodejs.org/api/stream.html#stream_transform_transform_chunk_encoding_callback
        transformOptions.transform = function (file, encoding, callback) {
            transformMethod(transformStream, file, encoding, data)
                .then(function () { callback(); })
                .catch(function (e) { callback(e); });
        };
        if (flushMethod) {
            transformOptions.flush = function (callback) {
                flushMethod(transformStream, data)
                    .then(function () { return callback(); })
                    .catch(function (e) { return callback(e || new Error('An unknown error has occurred')); });
            };
        }
        // Primary Bower.json processing transform
        // https://nodejs.org/api/stream.html#stream_class_stream_transform_1
        return transformStream = new stream.Transform(transformOptions);
    };
    /**
     * Transfers files from a readable stream to a transform
     */
    Utils.transferFiles = function (readable, transform) {
        var eventEmitter;
        readable.on('data', eventEmitter = function (file) {
            transform.push(file);
        });
        return Utils.createReadableStreamCompletionPromise(readable)
            .finally(function () {
            readable.removeListener('data', eventEmitter);
        });
    };
    /**
     * *Stream completion promise
     * @param stream - Stream
     */
    Utils.createReadableStreamCompletionPromise = function (stream) {
        var deferred = Q.defer();
        // ReSharper disable once JoinDeclarationAndInitializerJs
        var onDone, onError = null, doneEmitter = null, errorEmitter = null;
        onDone = function () {
            deferred.resolve(undefined);
            if (errorEmitter) {
                errorEmitter.removeListener('error', onError);
            }
        };
        onError = function (e) {
            deferred.reject(e);
            if (doneEmitter) {
                doneEmitter.removeListener('end', onDone);
            }
        };
        doneEmitter = stream.once('end', onDone);
        errorEmitter = stream.once('error', onError);
        return deferred.promise;
    };
    /**
     * *Stream completion promise
     * @param stream - Stream
     */
    Utils.createWritableStreamCompletionPromise = function (stream) {
        var deferred = Q.defer();
        // ReSharper disable once JoinDeclarationAndInitializerJs
        var onDone, onError = null, doneEmitter = null, errorEmitter = null;
        onDone = function () {
            deferred.resolve(undefined);
            if (errorEmitter) {
                errorEmitter.removeListener('error', onError);
            }
        };
        onError = function (e) {
            deferred.reject(e);
            if (doneEmitter) {
                doneEmitter.removeListener('finish', onDone);
            }
        };
        doneEmitter = stream.once('finish', onDone);
        errorEmitter = stream.once('error', onError);
        return deferred.promise;
    };
    /**
     * Pushes data into the transform stream
     * https://nodejs.org/api/stream.html#stream_event_drain
     * @param transform - Transform
     * @param files - Files to push
     * @returns {Q.Promise<any>} Promise
     */
    Utils.pushFiles = function (transform, files) {
        var pushQueue = [].concat(files || []);
        if (pushQueue.length === 0) {
            return Utils.resolvedPromise();
        }
        var deferred = Q.defer();
        var canPush = true;
        var doPush = function () {
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
                        transform.once('data', function () {
                            process.nextTick(function () {
                                canPush = true;
                                doPush();
                            });
                        });
                    }
                }
                catch (e) {
                    Utils.log(LogType.Error, 'Failed to push file to the pipeline (path: \'{0}\', reason: \'{1}\')', item.path, e);
                    deferred.reject(undefined);
                    return;
                }
            } while (canPush && (pushQueue.length > 0));
        };
        // Do
        doPush();
        // Return
        return deferred.promise;
    };
    /**
     * Converts a buffer to text
     * @param buffer - Buffer to read from
     * @param encoding - Optional encoding
     * @returns {string} - Text
     */
    Utils.bufferToText = function (buffer, encoding) {
        return new string_decoder_1.StringDecoder(Utils.trimAdjustString(encoding, 'utf8', 'utf8', 'utf8', 'utf8')).write(buffer);
    };
    /**
     * Converts a stream to a buffer
     * @param readableStream - Stream
     * @returns {Buffer} - Buffer containing the stream's data
     */
    Utils.streamToBuffer = function (readableStream) {
        // Deferred
        var deferred = Q.defer();
        // Check if already buffer
        if (gUtil.isBuffer(readableStream)) {
            deferred.resolve(readableStream);
            return deferred.promise;
        }
        // Read
        var fileBuffer = new Buffer(0);
        readableStream.on('data', function (chunk) {
            if (typeof (chunk) === 'string') {
                fileBuffer = Buffer.concat([fileBuffer, new Buffer(chunk)]);
            }
            else {
                fileBuffer = Buffer.concat([fileBuffer, chunk]);
            }
        });
        readableStream.on('end', function () {
            deferred.resolve(fileBuffer);
        });
        readableStream.on('error', function (e) {
            deferred.reject(e);
        });
        // Return
        return deferred.promise;
    };
    /**
     * Converts a buffer to a readable stream
     * @param buffer - Buffer
     * @returns {stream.PassThrough} - Readable/Writable stream
     */
    Utils.bufferToStream = function (buffer) {
        // Check if already stream
        if (gUtil.isStream(buffer)) {
            if (buffer instanceof stream.Readable) {
                return buffer;
            }
            else {
                throw new Error('A non-readable stream cannot be converted to a readable stream');
            }
        }
        // Create
        var readableStream = new stream.PassThrough({ objectMode: true });
        readableStream.end(buffer);
        return readableStream;
    };
    /**
     * Reads a file asynchronously
     * @param path - Path of the file
     * @param encoding - Option string encoding
     * @returns {Q.Promise<string | Buffer>} - If encoding is specified, string data is returned.
     *		Else raw buffer is returned.
     */
    Utils.readFile = function (path, encoding) {
        var deferred = Q.defer();
        if (!Utils.isType(path, String) || ((path = path.trim()).length === 0)) {
            deferred.reject(new Error('File or directory \'' + Utils.toStr(path) + '\' is not valid'));
        }
        else {
            fs.readFile(path, encoding, function (err, data) {
                if (err) {
                    // Error
                    deferred.reject(err);
                }
                else {
                    deferred.resolve(data);
                }
            });
        }
        return deferred.promise;
    };
    /**
     * Parses the specified text or buffer tp JSON
     * @param obj - Text or buffer
     * @param encoding - Encoding to use while converting to string, if the specified object is a buffer
     * @returns {Q.Promise<T>} - Json object
     */
    Utils.parseJson = function (obj, encoding) {
        if (!Utils.isAnyType(obj, String, Buffer)) {
            return Utils.rejectedPromise(new Error('Invalid data to parse as JSON (expecting string or Buffer)'));
        }
        var str = (obj instanceof Buffer) ? Utils.bufferToText(obj, encoding) : obj;
        try {
            return Utils.resolvedPromise(JSON.parse(str.trim()));
        }
        catch (e) {
            return Utils.rejectedPromise(e);
        }
    };
    /**
     * Reads a json file asynchronously
     * @param path - Path of the file
     * @param encoding - Option string encoding
     * @returns {Q.Promise<string | Buffer>} - If encoding is specified, string data is returned.
     *		Else raw buffer is returned.
     */
    Utils.readText = function (path, encoding) {
        if (encoding === void 0) { encoding = 'utf8'; }
        var deferred = Q.defer();
        encoding = Utils.trimAdjustString(encoding, 'utf8', 'utf8', 'utf8', 'utf8');
        if (!Utils.isType(path, String) || ((path = path.trim()).length === 0)) {
            deferred.reject(new Error('File or directory \'' + Utils.toStr(path) + '\' is not valid'));
        }
        else {
            fs.readFile(path, encoding, function (err, data) {
                if (err) {
                    // Error
                    deferred.reject(err);
                }
                else {
                    // Parse JSON
                    try {
                        deferred.resolve(data);
                    }
                    catch (e) {
                        // Error
                        deferred.reject(e);
                    }
                }
            });
        }
        return deferred.promise;
    };
    /**
     * Reads a json file asynchronously
     * @param path - Path of the file
     * @param encoding - Option string encoding
     * @returns {Q.Promise<string | Buffer>} - If encoding is specified, string data is returned.
     *		Else raw buffer is returned.
     */
    Utils.readJson = function (path, encoding) {
        if (encoding === void 0) { encoding = 'utf8'; }
        var deferred = Q.defer();
        encoding = Utils.trimAdjustString(encoding, 'utf8', 'utf8', 'utf8', 'utf8');
        if (!Utils.isType(path, String) || ((path = path.trim()).length === 0)) {
            deferred.reject(new Error('File or directory \'' + Utils.toStr(path) + '\' is not valid'));
        }
        else {
            fs.readFile(path, encoding, function (err, data) {
                if (err) {
                    // Error
                    deferred.reject(err);
                }
                else {
                    // Parse JSON
                    try {
                        deferred.resolve(JSON.parse(data.trim()));
                    }
                    catch (e) {
                        // Error
                        deferred.reject(e);
                    }
                }
            });
        }
        return deferred.promise;
    };
    /**
     * Checks if a path exists
     * @param path - Path
     */
    Utils.fileOrDirectoryExists = function (path) {
        var deferred = Q.defer();
        if (!Utils.isType(path, String) || ((path = path.trim()).length === 0)) {
            deferred.reject(new Error('File or directory \'' + Utils.toStr(path) + '\' is not valid'));
        }
        else {
            fs.exists(path, function (exists) {
                if (exists) {
                    deferred.resolve(path);
                }
                else {
                    deferred.reject(new Error('File or directory \'' + path + '\' does not exist'));
                }
            });
        }
        return deferred.promise;
    };
    /**
     * Logs the message to console or gUtil.log
     * @param logType - Log type of the message
     * @param format - Message format
     * @param args - Format arguments
     */
    Utils.log = function (logType, format) {
        var args = [];
        for (var _i = 2; _i < arguments.length; _i++) {
            args[_i - 2] = arguments[_i];
        }
        var allArgs = [];
        // Detect type name prefix
        var typeNamePrefix = LogType[logType].toUpperCase();
        // Color
        switch (logType) {
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
    };
    return Utils;
})();
/**
 * Source Rule
 */
var SourceRule = (function () {
    /**
     * Constructor
     */
    function SourceRule(plugin, data) {
        this.type = RuleType.Source;
        this.plugin = plugin;
        this.id = data.id;
        var src = Utils.trimAdjustString(data.src, null, null, null, null);
        src = src ? src.split(',') : src;
        this.src = Utils.ensureArray(src, function (s) { return Utils.trimAdjustString(s, undefined, undefined, undefined, undefined); });
    }
    Object.defineProperty(SourceRule.prototype, "valid", {
        /**
         * Whether this instance is valid
         */
        get: function () {
            return !!this.src && !!this.src.length;
        },
        enumerable: true,
        configurable: true
    });
    /**
     * Resolves the source patterns
     */
    SourceRule.prototype.resolve = function (packageNames, exportName) {
        var _this = this;
        if (this.resolvedSrc) {
            return Utils.resolvedPromise();
        }
        this.resolvedSrc = {};
        return Q.all(Enumerable.from(packageNames).select(function (p) {
            return _this.getSrc(p, exportName)
                .then(function (s) {
                if ((s.length === 0) || !Enumerable.from(s).any(function (p) { return p.indexOf('!') < 0; })) {
                    Utils.log(LogType.Error, 'No positive source glob pattern specified (export: \'{0}\', src: \'{1}\')', exportName, _this.src);
                    return Utils.rejectedPromise();
                }
                // Save
                _this.resolvedSrc[p] = s;
                return Utils.resolvedPromise();
            })
                .catch(function (e) {
                Utils.log(LogType.Error, 'Failed to resolve source patterns (export: \'{0}\', src: \'{1}\', package: \'{2}\' reason: \'{3}\')', exportName, _this.src, p, e);
                return Utils.rejectedPromise();
            });
        })
            .toArray());
    };
    /**
     * Gets the source files
     * @returns {string[]} - Src glob patterns
     */
    SourceRule.prototype.getSrc = function (packageName, exportName) {
        var _this = this;
        var promise = Utils.resolvedPromise(Enumerable.from(this.src).toArray());
        // Return
        return promise
            .then(function (src) {
            var itemIndex = Enumerable.from(src).indexOf(function (p) { return Utils.testRegExp(BowerExportsPlugin.MainSrcTokenRegex, p); });
            if (itemIndex >= 0) {
                return _this.getPackageMainFiles(packageName, exportName)
                    .then(function (s) {
                    return src.slice(0, itemIndex).concat(s).concat(src.slice(itemIndex + 1));
                })
                    .catch(function () {
                    return src.slice(0, itemIndex).concat(src.slice(itemIndex + 1));
                });
            }
            else {
                return src;
            }
        })
            .then(function (src) {
            return _this.resolvedSrc[packageName] = Enumerable.from(src)
                .select(function (s) { return _this.plugin.replacePackageToken(s, packageName); })
                .toArray();
        });
    };
    /**
     * Returns package's main file list
     * @param pkgName - Package name
     */
    SourceRule.prototype.getPackageMainFiles = function (packageName, exportName) {
        var _this = this;
        // Check if we already have them
        var mainFiles = this.plugin.packageMainFiles[packageName];
        if (mainFiles && (mainFiles instanceof Array)) {
            return Utils.resolvedPromise(mainFiles);
        }
        // Path
        var pkgFolderPath = path.resolve(this.plugin.options.cwd, this.plugin.bowerComponentsDirectory, packageName);
        var bowerJsonPath = path.join(pkgFolderPath, '.bower.json');
        // Process
        return Utils.readJson(bowerJsonPath)
            .then(function (bowerJson) {
            mainFiles = Utils.ensureArray(bowerJson['main'], function (s) { return Utils.trimAdjustString(s, undefined, undefined, undefined, undefined); });
            if (mainFiles && (mainFiles.length > 0)) {
                _this.plugin.packageMainFiles[packageName] = mainFiles;
                return mainFiles;
            }
            else {
                Utils.log(LogType.Warning, 'Main files not found in .bower.json! (export: \'{0}\', package: \'{1}\')', exportName, packageName);
                return Utils.rejectedPromise();
            }
        });
    };
    /**
     * Returns this rule's stream
     */
    SourceRule.prototype.createStream = function (context) {
        var cwd = path.join(this.plugin.options.cwd, path.join(this.plugin.bowerComponentsDirectory, context.packageName));
        var base = path.join(this.plugin.options.cwd, path.join(this.plugin.bowerComponentsDirectory, context.packageName));
        var src = this.resolvedSrc[context.packageName];
        var stream;
        // Source Glob Stream
        try {
            stream = vinylSrc.src(src, { cwd: cwd, base: base, read: !this.plugin.options.nonReadableStreamedFiles });
            stream['name'] = context.exportInstance.name + ' - ' + context.packageName + ' - SOURCE';
            return stream;
        }
        catch (e) {
            Utils.log(LogType.Error, 'Failed creating source glob stream (export: \'{0}\', package: \'{1}\', src: \'{2}\')', context.exportInstance.name, context.packageName, src);
            return null;
        }
    };
    return SourceRule;
})();
/**
 * Name Filter Rule
 */
var FilterRule = (function () {
    /**
     * Constructor
     */
    function FilterRule(plugin, data) {
        this.type = RuleType.Filter;
        this.plugin = plugin;
        this.id = data.id;
        this.fullnameLike = Utils.trimAdjustString(data.fullnameLike, null, null, null, null);
        this.dirnameLike = Utils.trimAdjustString(data.dirnameLike, null, null, null, null);
        this.filenameLike = Utils.trimAdjustString(data.filenameLike, null, null, null, null);
        this.basenameLike = Utils.trimAdjustString(data.basenameLike, null, null, null, null);
        this.extnameLike = Utils.trimAdjustString(data.extnameLike, null, null, null, null);
    }
    Object.defineProperty(FilterRule.prototype, "valid", {
        /**
         * Whether this instance is valid
         */
        get: function () {
            return !!this.fullnameLike || !!this.dirnameLike
                || !!this.filenameLike || !!this.basenameLike
                || !!this.extnameLike;
        },
        enumerable: true,
        configurable: true
    });
    /**
     * Resolves the data items
     */
    FilterRule.prototype.resolve = function (packageNames, exportName) {
        return Utils.resolvedPromise();
    };
    /**
     * Tests the file against this rule
     * @param file - File to test
     */
    FilterRule.prototype.test = function (file, context) {
        return (!this.fullnameLike || Utils.testRegExp(Utils.toRegExp(this.plugin.replacePackageToken(this.fullnameLike, context.packageName), true), file.relative))
            && (!this.filenameLike || Utils.testRegExp(Utils.toRegExp(this.plugin.replacePackageToken(this.filenameLike, context.packageName), true), path.basename(file.relative)))
            && (!this.dirnameLike || Utils.testRegExp(Utils.toRegExp(this.plugin.replacePackageToken(this.dirnameLike, context.packageName), true), path.dirname(file.relative)))
            && (!this.basenameLike || Utils.testRegExp(Utils.toRegExp(this.plugin.replacePackageToken(this.basenameLike, context.packageName), true), path.basename(file.relative, path.extname(file.relative))))
            && (!this.extnameLike || Utils.testRegExp(Utils.toRegExp(this.plugin.replacePackageToken(this.extnameLike, context.packageName), true), path.extname(file.relative)));
    };
    /**
     * Returns this rule's stream
     */
    FilterRule.prototype.createStream = function (context) {
        return Utils.createTransform(Utils.proxy(this.transformObjects, this), null, context);
    };
    /**
     * Transform
     */
    FilterRule.prototype.transformObjects = function (transformStream, file, encoding, context) {
        if (this.test(file, context)) {
            transformStream.push(file);
        }
        return Utils.resolvedPromise();
    };
    return FilterRule;
})();
/**
 * Rename Rule
 */
var RenameRule = (function () {
    /**
     * Constructor
     */
    function RenameRule(plugin, data) {
        this.type = RuleType.Rename;
        this.plugin = plugin;
        this.id = data.id;
        this.if = Utils.trimAdjustString(data.if, null, null, null, null);
        this.replace = Utils.trimAdjustString(data.replace, null, null, null, null);
        this.in = Utils.adjustEnumValue(data.in, FileNamePart.FileName, FileNamePart, false);
        this.with = Utils.trimAdjustString(data.with, null, null, null, '');
        this.filters = null;
    }
    Object.defineProperty(RenameRule.prototype, "valid", {
        /**
         * Whether this instance is valid
         */
        get: function () {
            return this.with !== null;
        },
        enumerable: true,
        configurable: true
    });
    /**
     * Resolves the data items
     */
    RenameRule.prototype.resolve = function (packageNames, exportName) {
        var _this = this;
        if (this.if !== null) {
            var filter = Utils.trimAdjustString(this.if, null, null, null, '');
            filter = (filter || '').split(',');
            filter = Enumerable.from(filter).distinct().toArray();
            try {
                this.filters = Utils.ensureArray(filter, function (s) {
                    s = Utils.trimAdjustString(s, null, null, null, null);
                    if (!s) {
                        return undefined;
                    }
                    if (s.indexOf('#') === 0) {
                        return _this.plugin.resolveRule(s.substr(1), RuleType.Filter) || undefined;
                    }
                    var rule = new FilterRule(_this.plugin, {
                        id: Utils.generateUniqueRuleId(RuleType.Filter),
                        type: RuleType[RuleType.Filter].toLowerCase(),
                        fullnameLike: s
                    });
                    if (!rule.valid) {
                        Utils.log(LogType.Error, 'Invalid filter expression encountered (rule: \'{0}\', type: \'{1}\' src: \'{2}\')', _this.id, RuleType[_this.type], s);
                        throw new Error();
                    }
                    return rule;
                }) || [];
            }
            catch (e) {
                return Utils.rejectedPromise();
            }
        }
        return Utils.resolvedPromise();
    };
    /**
     * Returns this rule's stream
     */
    RenameRule.prototype.createStream = function (context) {
        return Utils.createTransform(Utils.proxy(this.transformObjects, this), null, context);
    };
    /**
     * Transform
     */
    RenameRule.prototype.transformObjects = function (transformStream, file, encoding, context) {
        // Filter
        if (this.filters && this.filters.length
            && Enumerable.from(this.filters).any(function (f) { return !f.test(file, context); })) {
            return Utils.pushFiles(transformStream, [file]);
        }
        // Rename
        var replace = this.replace
            ? Utils.toRegExp(this.plugin.replacePackageToken(this.replace, context.packageName), true)
            : new RegExp('^.*$', 'g');
        var withText = this.plugin.replacePackageToken(this.with, context.packageName);
        if (this.in === FileNamePart.FullName) {
            var name_1 = file.relative;
            name_1 = name_1.replace(replace, withText);
            Utils.setFilePath(file, name_1);
        }
        else if (this.in === FileNamePart.DirName) {
            var name_2 = path.dirname(file.relative);
            name_2 = name_2.replace(replace, withText);
            Utils.setFilePath(file, path.join(name_2, path.basename(file.relative)));
        }
        else if (this.in === FileNamePart.FileName) {
            var name_3 = path.basename(file.relative);
            name_3 = name_3.replace(replace, withText);
            Utils.setFilePath(file, path.join(path.dirname(file.relative), name_3));
        }
        else if (this.in === FileNamePart.BaseName) {
            var extname = path.extname(file.relative);
            var name_4 = path.basename(file.relative, extname);
            name_4 = name_4.replace(replace, withText);
            Utils.setFilePath(file, path.join(path.dirname(file.relative), name_4 + extname));
        }
        else if (this.in === FileNamePart.ExtName) {
            var extname = path.extname(file.relative);
            var name_5 = extname;
            name_5 = name_5.replace(replace, withText);
            Utils.setFilePath(file, path.join(path.dirname(file.relative), path.basename(file.relative, extname) + name_5));
        }
        // Push
        return Utils.pushFiles(transformStream, [file]);
    };
    return RenameRule;
})();
/**
 * Replace Contents Rule
 */
var ReplaceContentRule = (function () {
    /**
     * Constructor
     */
    function ReplaceContentRule(plugin, data) {
        this.type = RuleType.ReplaceContent;
        this.plugin = plugin;
        this.id = data.id;
        this.if = Utils.trimAdjustString(data.if, null, null, null, null);
        this.replace = Utils.trimAdjustString(data.replace, null, null, null, null);
        this.with = Utils.trimAdjustString(data.with, null, null, null, '');
        this.filters = null;
    }
    Object.defineProperty(ReplaceContentRule.prototype, "valid", {
        /**
         * Whether this instance is valid
         */
        get: function () {
            return this.with !== null;
        },
        enumerable: true,
        configurable: true
    });
    /**
     * Resolves the data items
     */
    ReplaceContentRule.prototype.resolve = function (packageNames, exportName) {
        var _this = this;
        if (this.if !== null) {
            var filter = Utils.trimAdjustString(this.if, null, null, null, '');
            filter = (filter || '').split(',');
            filter = Enumerable.from(filter).distinct().toArray();
            try {
                this.filters = Utils.ensureArray(filter, function (s) {
                    s = Utils.trimAdjustString(s, null, null, null, null);
                    if (!s) {
                        return undefined;
                    }
                    if (s.indexOf('#') === 0) {
                        return _this.plugin.resolveRule(s.substr(1), RuleType.Filter) || undefined;
                    }
                    var rule = new FilterRule(_this.plugin, {
                        id: Utils.generateUniqueRuleId(RuleType.Filter),
                        type: RuleType[RuleType.Filter].toLowerCase(),
                        fullnameLike: s
                    });
                    if (!rule.valid) {
                        Utils.log(LogType.Error, 'Invalid filter expression encountered (rule: \'{0}\', type: \'{1}\' src: \'{2}\')', _this.id, RuleType[_this.type], s);
                        throw new Error();
                    }
                    return rule;
                }) || [];
            }
            catch (e) {
                return Utils.rejectedPromise();
            }
        }
        return Utils.resolvedPromise();
    };
    /**
     * Returns this rule's stream
     */
    ReplaceContentRule.prototype.createStream = function (context) {
        return Utils.createTransform(Utils.proxy(this.transformObjects, this), null, context);
    };
    /**
     * Transform
     */
    ReplaceContentRule.prototype.transformObjects = function (transformStream, file, encoding, context) {
        // Filter
        if (this.filters && this.filters.length
            && Enumerable.from(this.filters).any(function (f) { return !f.test(file, context); })) {
            return Utils.pushFiles(transformStream, [file]);
        }
        // Perform only if we have content
        if (!file.isNull()) {
            var originalContentIsBuffer = gUtil.isBuffer(file.contents);
            var replace = this.replace
                ? Utils.toRegExp(this.plugin.replacePackageToken(this.replace, context.packageName), false)
                : new RegExp('^[\s\S]*$', 'g');
            var withText = this.plugin.replacePackageToken(this.with, context.packageName);
            // We need buffer to replace content
            return Utils.streamToBuffer(file.contents)
                .then(function (buffer) {
                try {
                    // Get String
                    var text = Utils.bufferToText(buffer);
                    // Replace
                    text = text.replace(replace, withText);
                    buffer = new Buffer(text);
                    // Set back
                    if (originalContentIsBuffer) {
                        file.contents = buffer;
                    }
                    else {
                        file.contents = Utils.bufferToStream(buffer);
                    }
                    // Return
                    transformStream.push(file);
                    return Utils.resolvedPromise();
                }
                catch (e) {
                    Utils.log(LogType.Error, 'Failed to replace content (export: \'{0}\', package: \'{1}\', reason: \'{2}\')', context.exportInstance.name, context.packageName, e);
                    return Utils.rejectedPromise();
                }
            });
        }
        else {
            // Push & skip
            transformStream.push(file);
            return Utils.resolvedPromise();
        }
    };
    return ReplaceContentRule;
})();
/**
 * Move Rule
 */
var MoveRule = (function () {
    /**
     * Constructor
     */
    function MoveRule(plugin, data) {
        this.type = RuleType.Move;
        this.plugin = plugin;
        this.id = data.id;
        this.to = Utils.trimAdjustString(data.to, null, null, null, null);
        this.hierarchyAdjustment = Utils.adjustEnumValue(data.withHierarchy, HierarchyAdjustment.None, HierarchyAdjustment, false);
    }
    Object.defineProperty(MoveRule.prototype, "valid", {
        /**
         * Whether this instance is valid
         */
        get: function () {
            return !!this.to;
        },
        enumerable: true,
        configurable: true
    });
    /**
     * Resolves the data items
     */
    MoveRule.prototype.resolve = function (packageNames, exportName) {
        return Utils.resolvedPromise();
    };
    /**
     * Returns this rule's stream
     */
    MoveRule.prototype.createStream = function (context) {
        // Clear
        context.moveFiles = [];
        // Transform
        var transform = Utils.createTransform(Utils.proxy(this.transformObjects, this), Utils.proxy(this.flushObjects, this), context);
        transform['name'] = context.exportInstance.name + ' - ' + context.packageName + ' - MOVE';
        return transform;
    };
    /**
     * Collects the paths of the objects
     */
    MoveRule.prototype.transformObjects = function (transform, file, encoding, context) {
        if (!file.isDirectory()) {
            if (this.hierarchyAdjustment === HierarchyAdjustment.None) {
                var to = this.plugin.replacePackageToken(this.to, context.exportInstance.overridingMovePackageName, true);
                Utils.setFilePath(file, path.join(to, file.relative));
                transform.push(file);
            }
            else if (this.hierarchyAdjustment === HierarchyAdjustment.Flattened) {
                var to = this.plugin.replacePackageToken(this.to, context.exportInstance.overridingMovePackageName, true);
                Utils.setFilePath(file, path.join(to, path.basename(file.relative)));
                transform.push(file);
            }
            else {
                context.moveFiles.push(file);
            }
        }
        return Utils.resolvedPromise();
    };
    /**
     * Pushes the objects
     */
    MoveRule.prototype.flushObjects = function (transform, context) {
        // If not minimized, return
        if (this.hierarchyAdjustment !== HierarchyAdjustment.Minimized) {
            return Utils.resolvedPromise();
        }
        // Adjust Hierarchy
        var commonPathSegment = Utils.findCommonSegment(Enumerable.from(context.moveFiles)
            .select(function (f) { return path.dirname(f.relative); }).toArray());
        // Rebase all files
        Enumerable.from(context.moveFiles)
            .forEach(function (f) { return Utils.removeCommonPathSegment(f, commonPathSegment); });
        // Move to
        var to = this.plugin.replacePackageToken(this.to, context.exportInstance.overridingMovePackageName, true);
        Enumerable.from(context.moveFiles)
            .forEach(function (f) { return Utils.setFilePath(f, path.join(to, f.relative)); });
        // Now write the files
        return Utils.pushFiles(transform, context.moveFiles);
    };
    return MoveRule;
})();
/**
 * Check Changes
 */
var CheckChangesRule = (function () {
    /**
     * Constructor
     */
    function CheckChangesRule(plugin, data) {
        this.type = RuleType.CheckChanges;
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
            }
            catch (e) {
                Utils.log(LogType.Error, 'Failed to parse \'hasChanged\' (rule: \'{0}\', type: \'{1}\', reason: \'{2}\')', this.id, RuleType[this.type], e);
                this._isValid = false;
            }
        }
    }
    Object.defineProperty(CheckChangesRule.prototype, "valid", {
        /**
         * Whether this instance is valid
         */
        get: function () {
            return this._isValid
                && (this.plugin.options.checkChangesDestination !== null);
        },
        enumerable: true,
        configurable: true
    });
    /**
     * Resolves the data items
     */
    CheckChangesRule.prototype.resolve = function (packageNames, exportName) {
        return Utils.resolvedPromise();
    };
    /**
     * Returns this rule's stream
     */
    CheckChangesRule.prototype.createStream = function (context) {
        // gulp-changed Options
        var gChangedOptions = {};
        // Extension
        if (this.extension) {
            gChangedOptions.extension = this.extension;
        }
        if (this.hasChanged) {
            gChangedOptions.hasChanged = this.hasChanged;
        }
        // Return
        return gChanged(this.plugin.options.checkChangesDestination, gChangedOptions);
    };
    return CheckChangesRule;
})();
/**
 * Export Directive
 */
var Export = (function () {
    /**
     * Constructor
     */
    function Export(plugin, data, defaultRules, includeRules) {
        var _this = this;
        this.plugin = plugin;
        this.name = Utils.trimAdjustString(data.name, null, null, null, null);
        this._isValid = true;
        var from = Utils.trimAdjustString(data.from, null, null, null, null);
        from = from ? from.split(',') : from;
        this.packageNames = Enumerable.from(Utils.ensureArray(from, function (s) {
            s = Utils.trimAdjustString(s, null, null, null, null);
            if (!s) {
                return undefined;
            }
            var regex = Utils.toRegExp(s, true);
            if (!regex) {
                Utils.log(LogType.Error, 'Failed to convert string to RegExp (export: \'{0}\', src: \'{1}\')', _this.name, s);
                _this._isValid = false;
                return undefined;
            }
            return Enumerable.from(plugin.packageNames)
                .where(function (p) { return Utils.testRegExp(regex, p); })
                .toArray();
        }) || []).distinct().toArray();
        var source = Utils.trimAdjustString(data.select, defaultRules.source, defaultRules.source, defaultRules.source, '');
        source = (source || '').split(',');
        source.push(includeRules.source);
        source = Enumerable.from(source).distinct().toArray();
        var sourceRules = Utils.ensureArray(source, function (s) {
            s = Utils.trimAdjustString(s, null, null, null, null);
            if (!s) {
                return undefined;
            }
            if (s === '#main#') {
                return new SourceRule(plugin, {
                    id: Utils.generateUniqueRuleId(RuleType.Source),
                    type: RuleType[RuleType.Source].toLowerCase(),
                    src: s
                });
            }
            else if (s.indexOf('#') === 0) {
                return plugin.resolveRule(s.substr(1), RuleType.Source) || undefined;
            }
            else {
                return new SourceRule(plugin, {
                    id: Utils.generateUniqueRuleId(RuleType.Source),
                    type: RuleType[RuleType.Source].toLowerCase(),
                    src: s
                });
            }
        }) || [];
        if (sourceRules.length === 0) {
            this.source = null;
        }
        else if (sourceRules.length === 1) {
            this.source = sourceRules[0];
        }
        else {
            this.source = new SourceRule(plugin, {
                id: Utils.generateUniqueRuleId(RuleType.Source),
                type: RuleType[RuleType.Source].toLowerCase(),
                src: Enumerable.from(sourceRules).selectMany(function (s) { return s.src || []; }).toJoinedString(',')
            });
        }
        if (this.source && !this.source.valid) {
            Utils.log(LogType.Error, 'Invalid source expressions encountered (export: \'{0}\', src: \'{1}\')', this.name, this.source.src);
            this._isValid = false;
            this.source = null;
        }
        var filter = Utils.trimAdjustString(data.filter, defaultRules.filter, defaultRules.filter, defaultRules.filter, '');
        filter = (filter || '').split(',');
        filter.push(includeRules.filter);
        filter = Enumerable.from(filter).distinct().toArray();
        this.filter = Utils.ensureArray(filter, function (s) {
            s = Utils.trimAdjustString(s, null, null, null, null);
            if (!s) {
                return undefined;
            }
            if (s.indexOf('#') === 0) {
                return plugin.resolveRule(s.substr(1), RuleType.Filter) || undefined;
            }
            var rule = new FilterRule(plugin, {
                id: Utils.generateUniqueRuleId(RuleType.Filter),
                type: RuleType[RuleType.Filter].toLowerCase(),
                fullnameLike: s
            });
            if (!rule.valid) {
                Utils.log(LogType.Error, 'Invalid filter expression encountered (export: \'{0}\', src: \'{1}\')', _this.name, s);
                _this._isValid = false;
                rule = undefined;
            }
            return rule;
        }) || [];
        var rename = Utils.trimAdjustString(data.rename, defaultRules.rename, defaultRules.rename, defaultRules.rename, '');
        rename = (rename || '').split(',');
        rename.push(includeRules.rename);
        rename = Enumerable.from(rename).distinct().toArray();
        this.rename = Utils.ensureArray(rename, function (s) {
            s = Utils.trimAdjustString(s, null, null, null, null);
            if (!s) {
                return undefined;
            }
            if (s.indexOf('#') === 0) {
                return plugin.resolveRule(s.substr(1), RuleType.Rename) || undefined;
            }
            var rule = new RenameRule(plugin, {
                id: Utils.generateUniqueRuleId(RuleType.Rename),
                type: RuleType[RuleType.Rename].toLowerCase(),
                with: s
            });
            if (!rule.valid) {
                Utils.log(LogType.Error, 'Invalid rename expression encountered (export: \'{0}\', src: \'{1}\')', _this.name, s);
                _this._isValid = false;
                rule = undefined;
            }
            return rule;
        }) || [];
        var replaceContent = Utils.trimAdjustString(data.replaceContent, defaultRules.replaceContent, defaultRules.replaceContent, defaultRules.replaceContent, '');
        replaceContent = (replaceContent || '').split(',');
        replaceContent.push(includeRules.replaceContent);
        replaceContent = Enumerable.from(replaceContent).distinct().toArray();
        this.replaceContent = Utils.ensureArray(replaceContent, function (s) {
            s = Utils.trimAdjustString(s, null, null, null, null);
            if (!s) {
                return undefined;
            }
            if (s.indexOf('#') === 0) {
                return plugin.resolveRule(s.substr(1), RuleType.ReplaceContent) || undefined;
            }
            var rule = new ReplaceContentRule(plugin, {
                id: Utils.generateUniqueRuleId(RuleType.ReplaceContent),
                type: RuleType[RuleType.ReplaceContent].toLowerCase(),
                with: s
            });
            if (!rule.valid) {
                Utils.log(LogType.Error, 'Invalid replace expression encountered (export: \'{0}\', src: \'{1}\')', _this.name, s);
                _this._isValid = false;
                rule = undefined;
            }
            return rule;
        }) || [];
        this.move = null;
        var move = Utils.trimAdjustString(data.move, defaultRules.move, defaultRules.move, defaultRules.move, null);
        if (move) {
            if (move.indexOf('#') === 0) {
                this.move = plugin.resolveRule(move.substr(1), RuleType.Move);
            }
            else {
                this.move = new MoveRule(plugin, {
                    id: Utils.generateUniqueRuleId(RuleType.Move),
                    type: RuleType[RuleType.Move].toLowerCase(),
                    to: move
                });
                if (!this.move.valid) {
                    Utils.log(LogType.Error, 'Invalid move expression encountered (export: \'{0}\', src: \'{1}\')', this.name, move);
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
        var ifChanged = Utils.trimAdjustString(data.ifChanged, defaultRules.changeCheckers, defaultRules.changeCheckers, defaultRules.changeCheckers, null);
        ifChanged = (ifChanged || '').split(',');
        ifChanged.push(includeRules.changeCheckers);
        ifChanged = Enumerable.from(ifChanged).distinct().toArray();
        this.ifChanged = Utils.ensureArray(ifChanged, function (s) {
            s = Utils.trimAdjustString(s, null, null, null, null);
            if (!s) {
                return undefined;
            }
            if (s.indexOf('#') === 0) {
                return plugin.resolveRule(s.substr(1), RuleType.CheckChanges) || undefined;
            }
            else {
                Utils.log(LogType.Error, 'Invalid check changes expression encountered (export: \'{0}\', src: \'{1}\')', _this.name, s);
                _this._isValid = false;
                return undefined;
            }
        }) || [];
    }
    Object.defineProperty(Export.prototype, "valid", {
        /**
         * Whether this instance is valid
         */
        get: function () {
            return this._isValid
                && !!this.packageNames
                && (this.packageNames.length > 0)
                && !!this.source;
        },
        enumerable: true,
        configurable: true
    });
    /**
     * Resolves the source patterns
     */
    Export.prototype.resolve = function () {
        var _this = this;
        var promises = [];
        promises.push(this.source.resolve(this.packageNames, this.name));
        promises = promises.concat(Enumerable.from(this.filter).select(function (f) { return f.resolve(_this.packageNames, _this.name); }).toArray());
        promises = promises.concat(Enumerable.from(this.rename).select(function (r) { return r.resolve(_this.packageNames, _this.name); }).toArray());
        promises = promises.concat(Enumerable.from(this.replaceContent).select(function (r) { return r.resolve(_this.packageNames, _this.name); }).toArray());
        if (this.move) {
            promises.push(this.move.resolve(this.packageNames, this.name));
        }
        promises = promises.concat(Enumerable.from(this.ifChanged).select(function (c) { return c.resolve(_this.packageNames, _this.name); }).toArray());
        // Return
        return Q.all(promises);
    };
    /**
     * Creates the export stream for the specified package name
     */
    Export.prototype.createStream = function (packageName) {
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
        var stream = this.source.createStream(context);
        if (!stream) {
            return null;
        }
        // Pass it through filters
        Enumerable.from(this.filter).where(function (f) { return f.valid; }).forEach(function (f) { return stream = stream.pipe(f.createStream(context)); });
        // Rename Rules
        Enumerable.from(this.rename).where(function (r) { return r.valid; }).forEach(function (r) { return stream = stream.pipe(r.createStream(context)); });
        // Replace Content Rules
        Enumerable.from(this.replaceContent).where(function (r) { return r.valid; }).forEach(function (r) { return stream = stream.pipe(r.createStream(context)); });
        // Move rule
        if (this.move && this.move.valid) {
            stream = stream.pipe(this.move.createStream(context));
        }
        // Check Changes
        Enumerable.from(this.ifChanged).where(function (r) { return r.valid; }).forEach(function (r) { return stream = stream.pipe(r.createStream(context)); });
        // Pipe the package streams into the transform
        stream['name'] = this.name + ' - ' + packageName;
        return stream;
    };
    return Export;
})();
/**
 * Primary Plugin
 */
var BowerExportsPlugin = (function () {
    /**
     * Constructor
     * @param options - Options for the plugin
     */
    function BowerExportsPlugin(options) {
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
    BowerExportsPlugin.bowerExports = function (options) {
        // Wait if being debugged
        debugger;
        // Create instance
        var pluginInstance = new BowerExportsPlugin(options);
        // Return init stream
        return Utils.createTransform(Utils.proxy(pluginInstance.initializationTransform, pluginInstance));
    };
    /**
     * Creates streams on demans
     * @param callback - Callback to return the streams
     */
    BowerExportsPlugin.prototype.exportsStreamFactory = function (callback) {
        if (!this._streamFactoryQueue) {
            var creator = function (xx, pp, ii, jj) {
                Utils.log(LogType.Information, 'Processing \'{0}\' - \'{1}\'...', xx.name, pp);
                return function () { return xx.createStream(pp); };
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
            }
            else {
                callback(null, stream);
            }
        }
        else {
            // No more exports end
            callback(null, null);
        }
    };
    /**
     * Initializes the context from the bower.json file flowing in
     */
    BowerExportsPlugin.prototype.initializationTransform = function (transform, file, encoding) {
        var _this = this;
        // Read file contents
        return Utils.streamToBuffer(file.contents)
            .then(function (buffer) { return Utils.parseJson(buffer); })
            .then(function (bowerJson) {
            // Get all package names
            _this.packageNames = Enumerable.from(Utils.getProperties(bowerJson.dependencies))
                .select(function (p) { return Utils.trimAdjustString(p.key, null, null, null, null); })
                .where(function (p) { return !!p; })
                .toArray();
            // Reject if no package names
            if (_this.packageNames.length === 0) {
                Utils.log(LogType.Warning, 'No packages found in the bower.json dependencies (path: \'{0}\')', file.path);
                return Utils.rejectedPromise();
            }
            // Check external exports file
            if (_this.options.externalExportsJsonFilePath) {
                return Utils.readJson(_this.options.externalExportsJsonFilePath);
            }
            else if (bowerJson.bowerExports) {
                return Utils.resolvedPromise(bowerJson.bowerExports);
            }
            else {
                return Utils.rejectedPromise(new Error('Bower Exports section not found'));
            }
        })
            .then(function (b) {
            // Create rules
            _this.rules = Utils.ensureArray(b.rules, function (r) {
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
                        var sourceRule = new SourceRule(_this, r);
                        return sourceRule.valid ? sourceRule : undefined;
                    }
                    else if (ruleType === RuleType.Filter) {
                        var nameFilterRule = new FilterRule(_this, r);
                        return nameFilterRule.valid ? nameFilterRule : undefined;
                    }
                    else if (ruleType === RuleType.Rename) {
                        var renameRule = new RenameRule(_this, r);
                        return renameRule.valid ? renameRule : undefined;
                    }
                    else if (ruleType === RuleType.ReplaceContent) {
                        var replaceContentRule = new ReplaceContentRule(_this, r);
                        return replaceContentRule.valid ? replaceContentRule : undefined;
                    }
                    else if (ruleType === RuleType.Move) {
                        var moveRule = new MoveRule(_this, r);
                        return moveRule.valid ? moveRule : undefined;
                    }
                    else if (ruleType === RuleType.CheckChanges) {
                        var checkChangesRule = new CheckChangesRule(_this, r);
                        return checkChangesRule.valid ? checkChangesRule : undefined;
                    }
                }
                catch (e) {
                    Utils.log(LogType.Warning, 'Rule instance could not be created (src: \'{0}\', reason: \'{1}\')', r, e);
                }
                return undefined;
            });
            if ((_this.rules === null) || (_this.rules.length === 0)) {
                return Utils.rejectedPromise(new Error('No valid rules present in the bower exports'));
            }
            // Check for duplicate ids
            var rulesEnum = Enumerable.from(_this.rules);
            var typeGroups = rulesEnum.groupBy(function (r) { return r.type; });
            var duplicatesFound = false;
            typeGroups.forEach(function (g) {
                Enumerable.from(g).forEach(function (r, i) {
                    var loggedIds = {};
                    Enumerable.from(g).forEach(function (r1, i1) {
                        if ((r.id === r1.id) && (i !== i1)) {
                            duplicatesFound = true;
                            if (!loggedIds[r.id]) {
                                Utils.log(LogType.Error, 'Duplicate rule id found (id: \'{0}\', type: \'{1}\')', r.id, RuleType[g.key()]);
                            }
                            loggedIds[r.id] = true;
                        }
                    });
                });
            });
            if (duplicatesFound) {
                return Utils.rejectedPromise();
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
            _this.exports = Utils.ensureArray(b.exports, function (x) {
                if (!x) {
                    return undefined;
                }
                var xObj = new Export(_this, x, defaultRules, includeRules);
                return xObj.valid ? xObj : undefined;
            });
            if ((_this.exports === null) || (_this.exports.length === 0)) {
                return Utils.rejectedPromise(new Error('No valid exports present in the bower exports'));
            }
            Enumerable.from(_this.exports).forEach(function (x, i) { return x.name = x.name || ('Export ' + (i + 1)); });
            // Check bower_components folder
            var bCompsPromise = Utils.resolvedPromise(null);
            // options.bowerComponentsDirectory
            return bCompsPromise.then(function (p) {
                if (!p && _this.options.bowerComponentsDirectory) {
                    return Utils.fileOrDirectoryExists(_this.options.bowerComponentsDirectory);
                }
                else {
                    return Utils.resolvedPromise(p);
                }
            })
                .then(function (p) {
                if (!p) {
                    var bowerRcFilePathSpecified = !!_this.options.bowerRcFilePath;
                    var bowerRcFilePath = _this.options.bowerRcFilePath || path.join(path.dirname(file.path), '.bowerrc');
                    return Utils.readJson(bowerRcFilePath)
                        .then(function (rc) {
                        var dir = Utils.trimAdjustString(rc.directory, null, null, null, null);
                        if (dir) {
                            return Utils.fileOrDirectoryExists(dir);
                        }
                        else {
                            return Utils.rejectedPromise(new Error('The specified .bowerrc file does not contain the path of bower_components'));
                        }
                    })
                        .catch(function (e) {
                        if (bowerRcFilePathSpecified) {
                            return Utils.rejectedPromise(e);
                        }
                        else {
                            return Utils.resolvedPromise(p);
                        }
                    });
                }
                else {
                    return Utils.resolvedPromise(p);
                }
            })
                .then(function (p) {
                if (!p) {
                    return Utils.fileOrDirectoryExists(path.join(path.dirname(file.path), 'bower_components'));
                }
                else {
                    return Utils.resolvedPromise(p);
                }
            });
        })
            .then(function (p) {
            // Save bower components directory
            _this.bowerComponentsDirectory = p;
            // Resolve all export rule src
            _this.packageMainFiles = {};
            return Q.all(Enumerable.from(_this.exports).select(function (x) { return x.resolve(); }).toArray());
        })
            .then(function () {
            // Push the file & finish
            if (_this.options.passThroughSourceFiles) {
                Utils.pushFiles(transform, [file]);
            }
            // Stream Export Streams
            var exportsStream = multistream(Utils.proxy(_this.exportsStreamFactory, _this), { objectMode: true, highWaterMark: BowerExportsPlugin.TransformStreamReadableHighWaterMark });
            // We are done when exportsStream is done
            return Utils.transferFiles(exportsStream, transform);
        })
            .catch(function (e) {
            // Log
            if (e) {
                Utils.log(LogType.Error, 'Initialization failed (src: \'{0}\', reason: \'{1}\')', file.path, e);
            }
            // Return
            return Utils.rejectedPromise();
        });
    };
    /**
     * Returns the rule instance
     * @param id - Id of the rule
     * @param ruleType - Rule type
     * @returns {TRule} - Rule instance
     */
    BowerExportsPlugin.prototype.resolveRule = function (id, ruleType) {
        return Enumerable.from(this.rules)
            .singleOrDefault(function (r) { return (r.type === ruleType) && (r.id === id); });
    };
    /**
     * Replaces package token iin the given string
     * @param str - String to replace in
     * @param isPathString - Whether the specified string is a path segment
     * @param packageNameOverride - Override for package name
     * @returns {string} - Replaced string
     */
    BowerExportsPlugin.prototype.replacePackageToken = function (str, packageName, isPathString) {
        if (isPathString === void 0) { isPathString = false; }
        if (!Utils.isType(str, String)) {
            return str;
        }
        var packageName = Utils.isType(packageName, String) ? packageName : '';
        str = str.replace(BowerExportsPlugin.PackageNameTokenRegex, packageName);
        if (isPathString) {
            str = path.normalize(str).replace(/\\/g, '/');
        }
        return str;
    };
    BowerExportsPlugin.PluginName = 'gulp-bower-exports';
    BowerExportsPlugin.MainSrcToken = '#main#';
    BowerExportsPlugin.MainSrcTokenRegex = Utils.toRegExp(BowerExportsPlugin.MainSrcToken, true);
    BowerExportsPlugin.PackageNameToken = "#package#";
    BowerExportsPlugin.PackageNameTokenRegex = Utils.toRegExp(BowerExportsPlugin.PackageNameToken, false);
    BowerExportsPlugin.TransformStreamReadableHighWaterMark = 64;
    return BowerExportsPlugin;
})();
// Export
// ReSharper disable once CommonJsExternalModule
module.exports = BowerExportsPlugin.bowerExports;
