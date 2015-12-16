var fs = require('fs');
var path = require('path');
var stream = require('stream');
var Q = require('q');
var File = require('vinyl');
var Enumerable = require('linq');
var gUtil = require('gulp-util');
var gulp_util_1 = require('gulp-util');
var string_decoder_1 = require('string_decoder');
var LogType = require('./types/log-type');
var Constants = require('./constants');
var RuleType = require('./types/rule-type');
var Logger = require('./logger');
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
        if (Constants.isDebug) {
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
     * Replaces braced patterns in the source glob
     * @param src - Source glob
     * @returns {string} - Replaced source glob
     */
    Utils.replaceBracedGlobPatterns = function (src) {
        if (!Utils.isType(src, String)) {
            return src;
        }
        var regex = /\{.+\}/g;
        if (Utils.testRegExp(regex, src)) {
            src = src.replace(regex, function (m) {
                var innerContent = Utils.replaceBracedGlobPatterns(m.substr(1, m.length - 2));
                var parts = innerContent.split(',');
                return '@(' + Enumerable.from(parts).toJoinedString('|') + ')';
            });
        }
        return src;
    };
    /**
     * Sets file's path
     * @param file - File
     * @param relativePath - Relative path
     */
    Utils.setFilePath = function (file, relativePath) {
        file.path = path.normalize(path.join(file.base, relativePath));
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
            Logger.log(LogType.Warning, 'Regex creation failed (pattern: {0}, flags: {1}, reason: {2})', pattern, flags, e);
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
            fileInfo.isBuffer = file.isBuffer();
        }
        catch (e) { }
        try {
            fileInfo.isStream = file.isStream();
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
     * Creates a plugin error instance
     */
    Utils.pluginError = function (err) {
        err = err || new Error('An unknown error has occurred');
        return (err instanceof gulp_util_1.PluginError) ? err : new gulp_util_1.PluginError(Constants.pluginName, err, {
            showStack: Constants.isDebug,
            showProperties: Constants.isDebug
        });
    };
    /**
     * Creates a transform
     */
    Utils.createTransform = function (transformMethod, flushMethod, data, transformOptions) {
        // https://nodejs.org/api/stream.html#stream_class_stream_transform_1
        var transformStream = null;
        transformOptions = transformOptions || {};
        transformOptions.objectMode = true;
        transformOptions.highWaterMark = Constants.transformStreamReadableHighWaterMark;
        // https://nodejs.org/api/stream.html#stream_transform_transform_chunk_encoding_callback
        transformOptions.transform = function (file, encoding, callback) {
            try {
                transformMethod(transformStream, file, encoding, data)
                    .then(function () { callback(); })
                    .catch(function (e) { callback(Utils.pluginError(e)); });
            }
            catch (e) {
                callback(Utils.pluginError(e));
            }
        };
        if (flushMethod) {
            transformOptions.flush = function (callback) {
                try {
                    flushMethod(transformStream, data)
                        .then(function () { return callback(); })
                        .catch(function (e) { return callback(Utils.pluginError(e)); });
                }
                catch (e) {
                    callback(Utils.pluginError(e));
                }
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
                    Logger.log(LogType.Error, 'Failed to push file to the pipeline (path: \'{0}\', reason: \'{1}\')', item.path, e);
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
     * @param filePath - Path of the file
     * @param cwd - Current working directory
     * @param encoding - Option string encoding
     * @returns {Q.Promise<string | Buffer>} - If encoding is specified, string data is returned.
     *		Else raw buffer is returned.
     */
    Utils.readFile = function (filePath, cwd, encoding) {
        var deferred = Q.defer();
        var processCwd = process.cwd();
        cwd = Utils.trimAdjustString(cwd, processCwd, processCwd, processCwd, processCwd);
        encoding = Utils.trimAdjustString(encoding, 'utf-8', 'utf-8', 'utf-8', 'utf-8');
        var adjustedPath = Utils.trimAdjustString(filePath, null, null, null, null);
        if (adjustedPath === null) {
            deferred.reject(new Error('File or directory \'' + Utils.toStr(filePath) + '\' is not valid'));
        }
        else {
            adjustedPath = path.resolve(cwd, adjustedPath);
            fs.readFile(adjustedPath, encoding, function (err, data) {
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
     * @param filePath - Path of the file
     * @param cwd: Current working directory
     * @param encoding - Option string encoding
     * @returns {Q.Promise<string | Buffer>} - If encoding is specified, string data is returned.
     *		Else raw buffer is returned.
     */
    Utils.readText = function (filePath, cwd, encoding) {
        var deferred = Q.defer();
        var processCwd = process.cwd();
        cwd = Utils.trimAdjustString(cwd, processCwd, processCwd, processCwd, processCwd);
        encoding = Utils.trimAdjustString(encoding, 'utf-8', 'utf-8', 'utf-8', 'utf-8');
        var adjustedPath = Utils.trimAdjustString(filePath, null, null, null, null);
        if (adjustedPath === null) {
            deferred.reject(new Error('File or directory \'' + Utils.toStr(filePath) + '\' is not valid'));
        }
        else {
            adjustedPath = path.resolve(cwd, adjustedPath);
            fs.readFile(adjustedPath, encoding, function (err, data) {
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
     * @param cwd - Current working directory
     * @param encoding - Option string encoding
     * @returns {Q.Promise<string | Buffer>} - If encoding is specified, string data is returned.
     *		Else raw buffer is returned.
     */
    Utils.readJson = function (filePath, cwd, encoding) {
        var deferred = Q.defer();
        var processCwd = process.cwd();
        cwd = Utils.trimAdjustString(cwd, processCwd, processCwd, processCwd, processCwd);
        encoding = Utils.trimAdjustString(encoding, 'utf8', 'utf8', 'utf8', 'utf8');
        var adjustedPath = Utils.trimAdjustString(filePath, null, null, null, null);
        if (adjustedPath === null) {
            deferred.reject(new Error('File or directory \'' + Utils.toStr(filePath) + '\' is not valid'));
        }
        else {
            adjustedPath = path.resolve(cwd, adjustedPath);
            fs.readFile(adjustedPath, encoding, function (err, data) {
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
     * @param fileOrDirPath - Path
     * @param cwd - Current working directory
     */
    Utils.fileOrDirectoryExists = function (fileOrDirPath, cwd) {
        var deferred = Q.defer();
        var processCwd = process.cwd();
        cwd = Utils.trimAdjustString(cwd, processCwd, processCwd, processCwd, processCwd);
        var adjustedPath = Utils.trimAdjustString(fileOrDirPath, null, null, null, null);
        if (adjustedPath === null) {
            deferred.reject(new Error('File or directory \'' + Utils.toStr(fileOrDirPath) + '\' is not valid'));
        }
        else {
            adjustedPath = path.resolve(cwd, adjustedPath);
            fs.exists(adjustedPath, function (exists) {
                if (exists) {
                    deferred.resolve(fileOrDirPath);
                }
                else {
                    deferred.reject(new Error('File or directory \'' + fileOrDirPath + '\' does not exist'));
                }
            });
        }
        return deferred.promise;
    };
    return Utils;
})();
module.exports = Utils;
