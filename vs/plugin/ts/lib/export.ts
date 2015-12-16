import stream = require('stream');
import Q = require('q');
import File = require('vinyl');
import Enumerable = require('linq');
import Utils = require('./utils');
import LogType = require('./types/log-type');
import Logger = require('./logger');
import HierarchyAdjustment = require('./types/hierarchy-adjustment');
import Constants = require('./constants');
import RuleType = require('./types/rule-type');
import Rule = require('./rules/rule');
import ExecutionContext = require('./execution-context');
import SourceRule = require('./rules/source-rule');
import FilterRule = require('./rules/filter-rule');
import RenameRule = require('./rules/rename-rule');
import ReplaceContentRule = require('./rules/replace-content-rule');
import MoveRule = require('./rules/move-rule');
import TransformContext = require('./transform-context');
import ContextTuple = require('./types/context-tuple');

/**
 * Export directive
 */
class Export {
	private _exportData: IExportData;
	private _name: string;
	private _packageNames: string[];
	private _source: SourceRule;
	private _filter: FilterRule[];
	private _rename: RenameRule[];
	private _replaceContent: ReplaceContentRule[];
	private _move: MoveRule;
	private _overridingMovePackageName: string;
	private _hierarchyAdjustment: HierarchyAdjustment;

	/**
	 * Constructor
	 */
	public static create(data: IExportData, defaultExportRules: IDefaultRulesData, appendExportRules: IIncludeRulesData, context: ExecutionContext): Export {
		data = data || <IExportData>{};

		var exportInstance = new Export();
		exportInstance._exportData = data;
		var hasErrors = false;

		// Name
		var name = exportInstance._name = Utils.trimAdjustString(data.name, null, null, null, null);

		// Log
		Logger.log(LogType.Debug, 'Creating export directive - \'' + name + '\' ({0})...', data);

		// Package names
		Logger.log(LogType.Debug, 'Analyzing package names... {0}', exportInstance.getLogMessageContextInfo());
		var from: any = Utils.trimAdjustString(data.from, null, null, null, null);
		from = from ? from.split(',') : from;
		exportInstance._packageNames = Enumerable.from(Utils.ensureArray(from, s => {
			s = Utils.trimAdjustString(s, null, null, null, null);
			if (!s) {
				return undefined;
			}

			var regex = Utils.toRegExp(s, true);
			if (!regex) {
				hasErrors = true;
				Logger.log(LogType.Warning, 'Failed to convert package name string to RegExp {0}', exportInstance.getLogMessageContextInfo({ package: s }));
				return undefined;
			}

			return Enumerable.from(context.packageNames)
				.where(p => Utils.testRegExp(regex, p))
				.toArray();
		}) || []).distinct().toArray();
		if (hasErrors) {
			return null;
		}

		// Source Select
		Logger.log(LogType.Debug, 'Analyzing source rules... (export: \'{0}\')', name);
		var source: any = Utils.trimAdjustString(data.select, defaultExportRules.source, defaultExportRules.source, defaultExportRules.source, '');
		source = Utils.replaceBracedGlobPatterns(source);
		source = (source || '').split(',');

		var concatSource: any = Utils.trimAdjustString(appendExportRules.source, null, null, null, null);
		concatSource = Utils.replaceBracedGlobPatterns(concatSource);
		concatSource = (concatSource || '').split(',');

		source = source.concat(concatSource);
		source = Enumerable.from(source).distinct().toArray();
		var sourceRules = Utils.ensureArray(source, s => {
			s = Utils.trimAdjustString(s, null, null, null, null);
			if (!s) { return undefined; }

			if (s === '#main#') {
				return new SourceRule({
					id: Utils.generateUniqueRuleId(RuleType.Source),
					type: RuleType[RuleType.Source].toLowerCase(),
					src: s
				});
			} else if (s.indexOf('#') === 0) {
				return context.resolveRule<SourceRule>(s.substr(1), RuleType.Source) || undefined;
			} else {
				return new SourceRule({
					id: Utils.generateUniqueRuleId(RuleType.Source),
					type: RuleType[RuleType.Source].toLowerCase(),
					src: s
				});
			}
		}) || [];
		if (sourceRules.length === 0) {
			exportInstance._source = null;
		} else if (sourceRules.length === 1) {
			exportInstance._source = sourceRules[0];
		} else {
			exportInstance._source = new SourceRule({
				id: Utils.generateUniqueRuleId(RuleType.Source),
				type: RuleType[RuleType.Source].toLowerCase(),
				src: Enumerable.from(sourceRules).selectMany(s => s.src || []).toJoinedString(',')
			});
		}
		if (exportInstance._source != null) {
			if (!exportInstance._source.checkValid(true, name)) {
				return null;
			}
		}

		// Filter
		Logger.log(LogType.Debug, 'Analyzing filter rules... {0}', exportInstance.getLogMessageContextInfo());
		var filter: any = Utils.trimAdjustString(data.filter, defaultExportRules.filter, defaultExportRules.filter, defaultExportRules.filter, '');
		filter = (filter || '').split(',');

		var concatFilter: any = Utils.trimAdjustString(appendExportRules.filter, null, null, null, null);
		concatFilter = (concatFilter || '').split(',');

		filter = filter.concat(concatFilter);
		filter = Enumerable.from(filter).distinct().toArray();
		exportInstance._filter = Utils.ensureArray(filter, s => {
			s = Utils.trimAdjustString(s, null, null, null, null);
			if (!s) {
				return undefined;
			}

			if (s.indexOf('#') === 0) {
				return context.resolveRule<FilterRule>(s.substr(1), RuleType.Filter) || undefined;
			}
			var rule = new FilterRule({
				id: Utils.generateUniqueRuleId(RuleType.Filter),
				type: RuleType[RuleType.Filter].toLowerCase(),
				fullnameLike: s
			});
			if (!rule.checkValid(true, name)) {
				hasErrors = true;
				rule = undefined;
			}
			return rule;
		}) || [];
		if (hasErrors) {
			return null;
		}

		// Rename
		Logger.log(LogType.Debug, 'Analyzing rename rules... {0}', exportInstance.getLogMessageContextInfo());
		var rename: any = Utils.trimAdjustString(data.rename, defaultExportRules.rename, defaultExportRules.rename, defaultExportRules.rename, '');
		rename = (rename || '').split(',');

		var concatRename: any = Utils.trimAdjustString(appendExportRules.rename, null, null, null, null);
		concatRename = (concatRename || '').split(',');

		rename = rename.concat(concatRename);
		rename = Enumerable.from(rename).distinct().toArray();
		exportInstance._rename = Utils.ensureArray(rename, s => {
			s = Utils.trimAdjustString(s, null, null, null, null);
			if (!s) {
				return undefined;
			}

			if (s.indexOf('#') === 0) {
				return context.resolveRule<RenameRule>(s.substr(1), RuleType.Rename) || undefined;
			}
			var rule = new RenameRule({
				id: Utils.generateUniqueRuleId(RuleType.Rename),
				type: RuleType[RuleType.Rename].toLowerCase(),
				with: s
			});
			if (!rule.checkValid(true, name)) {
				hasErrors = true;
				rule = undefined;
			}
			return rule;
		}) || [];
		if (hasErrors) {
			return null;
		}

		// Replace content
		Logger.log(LogType.Debug, 'Analyzing replace content rules... {0}', exportInstance.getLogMessageContextInfo());
		var replaceContent: any = Utils.trimAdjustString(data.replaceContent, defaultExportRules.replaceContent, defaultExportRules.replaceContent, defaultExportRules.replaceContent, '');
		replaceContent = (replaceContent || '').split(',');

		var concatReplaceContent: any = Utils.trimAdjustString(appendExportRules.replaceContent, null, null, null, null);
		concatReplaceContent = (concatReplaceContent || '').split(',');

		replaceContent = replaceContent.concat(concatReplaceContent);
		replaceContent = Enumerable.from(replaceContent).distinct().toArray();
		exportInstance._replaceContent = Utils.ensureArray(replaceContent, s => {
			s = Utils.trimAdjustString(s, null, null, null, null);
			if (!s) {
				return undefined;
			}

			if (s.indexOf('#') === 0) {
				return context.resolveRule<ReplaceContentRule>(s.substr(1), RuleType.ReplaceContent) || undefined;
			}
			var rule = new ReplaceContentRule({
				id: Utils.generateUniqueRuleId(RuleType.ReplaceContent),
				type: RuleType[RuleType.ReplaceContent].toLowerCase(),
				with: s
			});
			if (!rule.checkValid(true, name)) {
				hasErrors = true;
				rule = undefined;
			}
			return rule;
		}) || [];
		if (hasErrors) {
			return null;
		}

		// Move
		Logger.log(LogType.Debug, 'Analyzing move rules... {0}', exportInstance.getLogMessageContextInfo());
		exportInstance._move = null;
		var move = Utils.trimAdjustString(data.move, defaultExportRules.move, defaultExportRules.move, defaultExportRules.move, null);
		if (move) {
			if (move.indexOf('#') === 0) {
				exportInstance._move = context.resolveRule<MoveRule>(move.substr(1), RuleType.Move);
			} else {
				exportInstance._move = new MoveRule({
					id: Utils.generateUniqueRuleId(RuleType.Move),
					type: RuleType[RuleType.Move].toLowerCase(),
					to: move
				});
			}
		}
		if (exportInstance._move != null) {
			if (!exportInstance._move.checkValid(true, name)) {
				return null;
			}
		}

		exportInstance._overridingMovePackageName = Utils.trimAdjustString(data.overridingMovePackageName, null, null, null, '');
		exportInstance._hierarchyAdjustment = Utils.adjustEnumValue(data.withHierarchy, null, HierarchyAdjustment, false);
		if (exportInstance._hierarchyAdjustment === null) {
			exportInstance._hierarchyAdjustment = Utils.adjustEnumValue(defaultExportRules.hierarchyAdjustment, null, HierarchyAdjustment, false);
		}

		// Return
		return exportInstance;
	}

	/**
	 * Export data
	 */
	public get exportData(): IExportData {
		return this._exportData;
	}

	/**
	 * Name
	 */
	public get name(): string {
		return this._name;
	}

	/**
	 * Name
	 */
	public set name(val: string) {
		this._name = val;
	}

	/**
	 * Package names
	 */
	public get packageNames(): string[] {
		return this._packageNames;
	}

	/**
	 * Source rule
	 */
	public get source(): SourceRule {
		return this._source;
	}

	/**
	 * Filter rules
	 */
	public get filter(): FilterRule[] {
		return this._filter;
	}

	/**
	 * Rename rules
	 */
	public get rename(): RenameRule[] {
		return this._rename;
	}

	/**
	 * Replace content rules
	 */
	public get replaceContent(): ReplaceContentRule[] {
		return this._replaceContent;
	}

	/**
	 * Move rules
	 */
	public get move(): MoveRule {
		return this._move;
	}

	/**
	 * Overridden package name
	 * @returns {} 
	 */
	public get overridingMovePackageName(): string {
		return this._overridingMovePackageName;
	}

	/**
	 * Hierarchy adjustment
	 * @returns {} 
	 */
	public get hierarchyAdjustment(): HierarchyAdjustment {
		return this._hierarchyAdjustment;
	}

	/**
	 * Identity info for the log
	 */
	public getLogMessageContextInfo(otherProperties?: any): string {
		var strs: string[] = [];
		var name = Utils.trimAdjustString(this._name, null, null, null, null);
		if (name !== null) {
			strs.push('export: \'' + this.name + '\'');
		} else {
			strs.push('export: \'' + JSON.stringify(this._exportData) + '\'');
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
	 * Resolves the source patterns
	 */
	public resolve(executionContext: ExecutionContext): Q.Promise<any> {
		var promises: Q.Promise<any>[] = [];

		promises.push(this.source.resolve(this, executionContext));
		promises = promises.concat(Enumerable.from(this.filter).select(f => f.resolve(this, executionContext)).toArray());
		promises = promises.concat(Enumerable.from(this.rename).select(r => r.resolve(this, executionContext)).toArray());
		promises = promises.concat(Enumerable.from(this.replaceContent).select(r => r.resolve(this, executionContext)).toArray());
		if (this.move) {
			promises.push(this.move.resolve(this, executionContext));
		}

		// Return
		return Q.all(promises);
	}

	/**
	 * Creates the export stream for the specified package name
	 */
	public createStream(packageName: string, context: ExecutionContext): NodeJS.ReadableStream {
		// Check valid
		if (!Enumerable.from(this._packageNames).contains(packageName)) {
			Logger.log(LogType.Warning, 'The package does not exist in the bower dependencies. {0}', this.getLogMessageContextInfo({ package: packageName }));
			return null;
		}

		// Execution Context
		var transformContext = new TransformContext(this, packageName, this.hierarchyAdjustment);
		var contextTuple = new ContextTuple(context, transformContext);

		// Combined Source Stream
		var transformStream = this.source.createStream(contextTuple);
		if (!transformStream) {
			return null;
		}

		// Pass it through filters
		Enumerable.from(this.filter).forEach(f => { return transformStream = transformStream.pipe(f.createStream(contextTuple)); });
		
		// Rename Rules
		Enumerable.from(this.rename).forEach(r => { return transformStream = transformStream.pipe(r.createStream(contextTuple)); });
		
		// Replace Content Rules
		Enumerable.from(this.replaceContent).forEach(r => { return transformStream = transformStream.pipe(r.createStream(contextTuple)); });
		
		// Move rule
		if (this.move) {
			transformStream = transformStream.pipe(this.move.createStream(contextTuple));
		}
		
		// Pipe the package streams into the transform
		transformStream['name'] = this.name + ' - ' + packageName;
		return transformStream;
	}
}
export = Export;