import Export = require('./export');
import HierarchyAdjustment = require('./types/hierarchy-adjustment');
import File = require('vinyl');

/**
 * Transform context
 */
class TransformContext {
	private _exportInstance: Export;
	private _packageName: string;
	private _hierarchyAdjustment: HierarchyAdjustment;

	public sourceFiles: File[];
	public moveFiles: File[];

	/**
	 * Constructor
	 */
	constructor(exportInstance: Export, packageName: string, hierarchyAdjustment: HierarchyAdjustment) {
		this._exportInstance = exportInstance;
		this._packageName = packageName;
		this._hierarchyAdjustment = hierarchyAdjustment;
		this.sourceFiles = [];
		this.moveFiles = [];
	}

	/**
	 * Export instance
	 */
	public get exportInstance(): Export {
		return this._exportInstance;
	}

	/**
	 * Package name
	 */
	public get packageName(): string {
		return this._packageName;
	}

	/**
	 * Hierarchy adjustment
	 */
	public get hierarchyAdjustment(): HierarchyAdjustment {
		return this._hierarchyAdjustment;
	}
}
export = TransformContext;