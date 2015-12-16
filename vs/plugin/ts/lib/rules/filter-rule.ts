import stream = require('stream');
import path = require('path');
import Q = require('q');
import File = require('vinyl');
import Enumerable = require('linq');
import LogType = require('../types/log-type');
import Logger = require('../logger');
import Rule = require('./rule');
import Utils = require('../utils');
import Export = require('../export');
import ExecutionContext = require('../execution-context');
import TransformContext = require('../transform-context');
import ContextTuple = require('../types/context-tuple');

/**
 * Filter Rule
 */
class FilterRule extends Rule {
	private _fullnameLike: string;
	private _dirnameLike: string;
	private _filenameLike: string;
	private _basenameLike: string;
	private _extnameLike: string;

	/**
	 * Constructor
	 */
	constructor(ruleData: IFilterRuleData) {
		// Adjust
		ruleData = ruleData || <IFilterRuleData>{};

		// Base
		super(ruleData);

		// This
		this._fullnameLike = Utils.trimAdjustString(ruleData.fullnameLike, null, null, null, null);
		this._dirnameLike = Utils.trimAdjustString(ruleData.dirnameLike, null, null, null, null);
		this._filenameLike = Utils.trimAdjustString(ruleData.filenameLike, null, null, null, null);
		this._basenameLike = Utils.trimAdjustString(ruleData.basenameLike, null, null, null, null);
		this._extnameLike = Utils.trimAdjustString(ruleData.extnameLike, null, null, null, null);
	}

	/**
	 * Valid
	 */
	public checkValid(log?: boolean, exportNameForLog?: string): boolean {
		var isValid = super.checkValid(true, exportNameForLog);
		if (!this._fullnameLike && !this._dirnameLike
			&& !this._filenameLike && !this._basenameLike
			&& !this._extnameLike) {
			isValid = false;
			if (log) {
				Logger.log(LogType.Error, 'At least one of the properties should be set (fullnameLike, dirnameLike, filenameLike, basenameLike, extnameLike) {0}', this.getLogMessageContextInfo(exportNameForLog));
			}
		}
		return isValid;
	}

	/**
	 * Returns this rule's stream
	 * @param context - Context data
	 */
	public createStream(context: ContextTuple): NodeJS.ReadWriteStream {
		return Utils.createTransform(Utils.proxy(this.transformObjects, this), null, context);
	}

	/**
	 * Tests the file against this rule
	 * @param file - File to test
	 */
	public test(file: File, context: ContextTuple): boolean {
		return (!this._fullnameLike || Utils.testRegExp(Utils.toRegExp(context.executionContext.replacePackageToken(this._fullnameLike, context.transformContext.packageName), true), file.relative))
			&& (!this._filenameLike || Utils.testRegExp(Utils.toRegExp(context.executionContext.replacePackageToken(this._filenameLike, context.transformContext.packageName), true), path.basename(file.relative)))
			&& (!this._dirnameLike || Utils.testRegExp(Utils.toRegExp(context.executionContext.replacePackageToken(this._dirnameLike, context.transformContext.packageName), true), path.dirname(file.relative)))
			&& (!this._basenameLike || Utils.testRegExp(Utils.toRegExp(context.executionContext.replacePackageToken(this._basenameLike, context.transformContext.packageName), true), path.basename(file.relative, path.extname(file.relative))))
			&& (!this._extnameLike || Utils.testRegExp(Utils.toRegExp(context.executionContext.replacePackageToken(this._extnameLike, context.transformContext.packageName), true), path.extname(file.relative)));
	}

	/**
	 * Transform
	 */
	private transformObjects(transformStream: stream.Transform, file: File, encoding: string, context: ContextTuple): Q.Promise<any> {
		Logger.log(LogType.Debug, 'Input file ({0}) {1}', file, this.getLogMessageContextInfo(context.transformContext.exportInstance.name));
		if (this.test(file, context)) {
			transformStream.push(file);
		}
		return Utils.resolvedPromise();
	}
}
export = FilterRule;