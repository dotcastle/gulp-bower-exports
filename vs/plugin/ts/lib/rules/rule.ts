import stream = require('stream');
import Q = require('q');
import Enumerable = require('linq');
import LogType = require('../types/log-type');
import Logger = require('../logger');
import Utils = require('../utils');
import RuleType = require('../types/rule-type');
import Export = require('../export');
import TransformContext = require('../transform-context');
import ExecutionContext = require('../execution-context');
import ContextTuple = require('../types/context-tuple');

/**
 * Rule base
 */
class Rule {
	private _ruleData: IRuleData;
	private _id: string;
	private _type: RuleType;

	/**
	 * Constructor
	 */
	constructor(ruleData: IRuleData) {
		ruleData = ruleData || <IRuleData>{};
		this._ruleData = ruleData;
		this._id = Utils.trimAdjustString(ruleData.id, null, null, null, null);
		this._type = Utils.adjustEnumValue(ruleData.type, null, RuleType, false);
	}

	/**
	 * Type display name
	 */
	public get typeDisplayName(): string {
		return ((this._type === null) ? 'Unknown' : RuleType[this._type]) + ' rule';
	}

	/**
	 * Rule data
	 */
	public get ruleData(): IRuleData {
		return this._ruleData;
	}

	/**
	 * Id
	 */
	public get id(): string {
		return this._id;
	}

	/**
	 * Rule type
	 */
	public get type(): RuleType {
		return this._type;
	}

	/**
	 * Identity info for the log
	 */
	public getLogMessageContextInfo(exportNameForLog: string, otherProperties?: any): string {
		var strs: string[] = [];
		exportNameForLog = Utils.trimAdjustString(exportNameForLog, null, null, null, null);
		if (exportNameForLog != null) {
			strs.push('export: \'' + exportNameForLog + '\'');
		}
		strs.push('type: \'' + this.typeDisplayName + '\'');
		if (this._id !== null) {
			strs.push('id: \'' + this._id + '\'');
		} else {
			strs.push('data: \'' + JSON.stringify(this._ruleData) + '\'');
		}
		if (otherProperties) {
			for (var prop in otherProperties) {
				if (otherProperties.hasOwnProperty(prop)) {
					strs.push(prop + ': \'' + Utils.toStr(otherProperties[prop]) + '\'');
				}
			}
		}
		return '(' + Enumerable.from(strs).toJoinedString(', ') + ')';
	}

	/**
	 * Check validity
	 * @param log - whether to log
	 * @param exportNameForLog - Name for logging
	 */
	public checkValid(log: boolean, exportNameForLog: string): boolean {
		var isValid = true;
		exportNameForLog = Utils.trimAdjustString(exportNameForLog, '', '', '', '');
		if (log) {
			Logger.log(LogType.Debug, 'Checking validity {0}...', this.getLogMessageContextInfo(exportNameForLog));
		}
		if (this._id === null) {
			isValid = false;
			if (log) {
				Logger.log(LogType.Error, 'Invalid property - id {0}', this.getLogMessageContextInfo(exportNameForLog));
			}
		}
		if (this._type === null) {
			isValid = false;
			if (log) {
				Logger.log(LogType.Error, 'Invalid property - type {0}', this.getLogMessageContextInfo(exportNameForLog));
			}
		}
		return isValid;
	}

	/**
	 * Resolves sources
	 * @param exportInstance - Export directive instance
	 * @param executionContext - Execution context
	 */
	public resolve(exportInstance: Export, executionContext: ExecutionContext): Q.Promise<any> {
		return Utils.resolvedPromise();
	}

	/**
	 * Returns this rule's stream
	 * @param context - Context data
	 */
	public createStream(context: ContextTuple): NodeJS.ReadWriteStream {
		return null;
	}
}
export = Rule;