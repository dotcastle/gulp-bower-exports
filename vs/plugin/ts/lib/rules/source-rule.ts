import stream = require('stream');
import path = require('path');
import Q = require('q');
import File = require('vinyl');
import vinylSrc = require('vinyl-fs');
import Enumerable = require('linq');
import LogType = require('../types/log-type');
import Logger = require('../logger');
import Rule = require('./rule');
import Constants = require('../constants');
import Utils = require('../utils');
import Export = require('../export');
import ExecutionContext = require('../execution-context');
import TransformContext = require('../transform-context');
import ContextTuple = require('../types/context-tuple');

/**
 * Source Rule
 */
class SourceRule extends Rule {
	private _src: string[];
	private _resolvedSrc: { [key: string]: string[] };

	/**
	 * Constructor
	 */
	constructor(ruleData: ISourceRuleData) {
		// Adjust
		ruleData = ruleData || <ISourceRuleData>{};

		// Base
		super(ruleData);

		// This
		var src: any = Utils.trimAdjustString(ruleData.src, null, null, null, null);
		src = src ? src.split(',') : src;
		this._src = Utils.ensureArray(src, s => Utils.trimAdjustString(s, undefined, undefined, undefined, undefined));
		this._resolvedSrc = null;
	}

	/**
	 * Src
	 */
	public get src(): string[] {
		return this._src;
	}

	/**
	 * Valid
	 */
	public checkValid(log?: boolean, exportNameForLog?: string): boolean {
		var isValid = super.checkValid(true, exportNameForLog);
		if (!this._src || (this._src.length === 0)) {
			isValid = false;
			if (log) {
				Logger.log(LogType.Error, 'Invalid property - src {0}', this.getLogMessageContextInfo(exportNameForLog));
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
		if (this._resolvedSrc) {
			return Utils.resolvedPromise();
		}

		this._resolvedSrc = {};
		return Q.all(Enumerable.from(exportInstance.packageNames).select(p =>
			this.getSrc(p, exportInstance, executionContext)
				.then(s => {
					if ((s.length === 0) || !Enumerable.from(s).any(p => p.indexOf('!') < 0)) {
						Logger.log(LogType.Error,
							'No positive source glob pattern specified (export: \'{0}\', src: \'{1}\')',
							exportInstance.name, this._src);
						return Utils.rejectedPromise<string[]>();
					}

					// Save
					this._resolvedSrc[p] = s;
					return Utils.resolvedPromise<string[]>();
				})
				.catch(e => {
					Logger.log(LogType.Error,
						'Failed to resolve source patterns (export: \'{0}\', src: \'{1}\', package: \'{2}\' reason: \'{3}\')',
						exportInstance.name, this.src, p, e);
					return Utils.rejectedPromise<string[]>();
				}))
			.toArray());
	}

	/**
	 * Returns this rule's stream
	 * @param context - Context data
	 */
	public createStream(context: ContextTuple): NodeJS.ReadWriteStream {
		var base = path.join(context.executionContext.bowerComponentsDirectory, context.transformContext.packageName);
		var src = this._resolvedSrc[context.transformContext.packageName];
		var resultStream: NodeJS.ReadableStream;

		// Source Glob Stream
		try {
			resultStream = vinylSrc.src(src, { cwd: base, base: base });
			resultStream['name'] = context.transformContext.exportInstance.name + ' - ' + context.transformContext.packageName + ' - SOURCE';
			return <NodeJS.ReadWriteStream>resultStream;
		} catch (e) {
			Logger.log(LogType.Error,
				'Failed creating source glob stream (export: \'{0}\', package: \'{1}\', src: \'{2}\')',
				context.transformContext.exportInstance.name, context.transformContext.packageName, src);
			return null;
		}
	}

	/**
	 * Gets the source files
	 */
	private getSrc(packageName: string, exportInstance: Export, executionContext: ExecutionContext): Q.Promise<string[]> {
		var promise = Utils.resolvedPromise(Enumerable.from(this.src).toArray());

		// Return
		return promise

			// Main Files
			.then(src => {
				var itemIndex = Enumerable.from(src).indexOf(p => Utils.testRegExp(Constants.mainSrcTokenRegex, p));
				if (itemIndex >= 0) {
					return this.getPackageMainFiles(packageName, exportInstance, executionContext)
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
				return this._resolvedSrc[packageName] = Enumerable.from(src)
					.select(s => executionContext.replacePackageToken(s, packageName))
					.toArray();
			});
	}

	/**
	 * Returns package's main file list
	 * @param pkgName - Package name
	 */
	private getPackageMainFiles(packageName: string, exportInstance: Export, executionContext: ExecutionContext): Q.Promise<string[]> {
		// Check if we already have them
		var mainFiles: string[] = executionContext.packageMainFiles[packageName];
		if (mainFiles && (mainFiles instanceof Array)) {
			return Utils.resolvedPromise(mainFiles);
		}

		// Path
		var pkgFolderPath = path.resolve(executionContext.bowerComponentsDirectory, packageName);
		var bowerJsonPath = path.join(pkgFolderPath, '.bower.json');

		// Process
		return Utils.readJson(bowerJsonPath)
			.then(bowerJson => {
				mainFiles = Utils.ensureArray(bowerJson['main'], s => Utils.trimAdjustString(s, undefined, undefined, undefined, undefined));
				if (mainFiles && (mainFiles.length > 0)) {
					executionContext.packageMainFiles[packageName] = mainFiles;
					return mainFiles;
				} else {
					Logger.log(LogType.Warning,
						'Main files not found in .bower.json! (export: \'{0}\', package: \'{1}\')',
						exportInstance.name, packageName);
					return Utils.rejectedPromise<string[]>();
				}
			});
	}
}
export = SourceRule;