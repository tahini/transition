/*
 * Copyright 2024, Polytechnique Montreal and contributors
 *
 * This file is licensed under the MIT License.
 * License text available at https://opensource.org/licenses/MIT
 */
import { v4 as uuidV4 } from 'uuid';
import _cloneDeep from 'lodash/cloneDeep';
import _set from 'lodash/set';
import _get from 'lodash/get';
import _isEqual from 'lodash/isEqual';
import _camelCase from 'lodash/camelCase';
import _upperFirst from 'lodash/upperFirst';
import _merge from 'lodash/merge';

export type BaseAttributesWithNumericId = {
    /**
     * The numeric ID of the object, this should come from the database. -1
     * means the object is new and not saved yet to the DB
     */
    id: number;
    uuid: string;
    is_frozen?: boolean | null | undefined; // TODO, remove null | undefined here, but first make sure we do not check for null or undefined elsewhere in the code
    created_at?: string | null;
    updated_at?: string | null;
};

/**
 * Parent class for all object classes with numeric IDs. The attributes field
 * corresponds to the fields in the database, while the data is a special field
 * for object that contains a json string, so any additional field should be in
 * data.
 */
export abstract class BaseObject<T extends BaseAttributesWithNumericId> {
    protected static displayName: string;

    private _attributes: T;
    private _isValid = false;
    private _errors: string[] = [];
    private _deleted = false;

    constructor(attributes: Partial<T>) {
        this._attributes = this._prepareAttributes(attributes);
    }

    get id(): number {
        return this._attributes.id;
    }

    get uuid(): string {
        return this._attributes.uuid;
    }

    get isValid(): boolean {
        return this._isValid;
    }

    get attributes(): Readonly<T> {
        return this._attributes;
    }

    mergeAttributes(updatedAttributes: Partial<T>): void {
        if (this.isFrozen() && updatedAttributes.is_frozen !== false) {
            // FIXME Should we simply silently fail or add a console.log?
            throw new Error('Cannot merge attributes on a frozen object');
        }
        _merge(this._attributes, _cloneDeep(updatedAttributes));
    }

    protected _prepareAttributes(attributes: Partial<T>): T {
        const { id, uuid, is_frozen, ...attribs } = attributes;
        const newAttribs = {
            ..._cloneDeep(attribs),
            id: id ? id : -1,
            uuid: uuid ? uuid : uuidV4(),
            is_frozen: is_frozen ? true : false
        } as Partial<T>;
        return newAttribs as T;
    }

    isFrozen(): boolean {
        return this._attributes.is_frozen === true;
    }

    set<K extends keyof T>(path: K, value: T[K]): void {
        if (this.isFrozen() && path !== 'is_frozen') {
            // FIXME Should we simply silently fail or add a console.log?
            throw new Error(`Cannot set ${String(path)} on a frozen object`);
        }
        const oldValue = _get(this._attributes, path);
        if (!_isEqual(oldValue, value)) {
            _set(this._attributes, path, value);
        }
    }

    /**
     * Clone this object. If deleteSpecifics is true, it removes all object's
     * ids and individual attributes like creation dates, but also fields that
     * contain links to children objects (like objects of different types that
     * have a foreign key to the current object). Implementers need to make sure
     * any such fields are removed.
     *
     * @protected
     * @param {boolean} [deleteSpecifics=true] If true, no ID or children
     * object's IDs will be copied, otherwise, it is a complete copy of the
     * attributes, including all children fields.
     * @param {boolean} [isNew=true] Whether the cloned object should be new or
     * not
     * @return {BaseObject<T>} An clone of the object
     * @memberof BaseObject
     */
    clone(deleteSpecifics: boolean = true, isNew: boolean = true): BaseObject<T> {
        return new (<any>this.constructor)(this.getClonedAttributes(deleteSpecifics), isNew);
    }

    protected abstract _validate(): [boolean, string[]];

    validate(): boolean {
        const [isValid, errors] = this._validate();
        this._errors = errors;
        this._isValid = isValid;
        return isValid;
    }

    getErrors(): string[] {
        return this._errors;
    }

    isDeleted(): boolean {
        return this._deleted;
    }

    setDeleted(): void {
        this._deleted = true;
    }

    isNew(): boolean {
        return this._attributes.id === -1;
    }

    /**
     * Clone this object's attribute. If deleteSpecifics is true, it removes all
     * object's ids and individual attributes like creation dates, but also
     * fields that contain links to children objects (like objects of different
     * types that have a foreign key to the current object). Implementers need
     * to make sure any such fields are removed.
     *
     * @protected
     * @param {boolean} [deleteSpecifics=true] If true, no ID or children
     * object's IDs will be copied, otherwise, it is a complete copy of the
     * attributes, including all children fields.
     * @return {Partial<T>}  A clone of the object's attributes
     */
    getClonedAttributes(deleteSpecifics: boolean = true): Partial<T> {
        const clonedAttributes = _cloneDeep(this._attributes) as Partial<T>;
        if (deleteSpecifics) {
            delete clonedAttributes.id;
            delete clonedAttributes.uuid;
            if (clonedAttributes.created_at) {
                delete clonedAttributes.created_at;
            }
            if (clonedAttributes.updated_at) {
                delete clonedAttributes.updated_at;
            }
        }
        return clonedAttributes;
    }

    get(path: string, defaultValue: unknown = undefined): unknown {
        const value = this._attributes[path] ? this._attributes[path] : _get(this._attributes, path);
        if (defaultValue === undefined && value !== undefined) {
            return value;
        }
        return value === null || value === undefined || value === '' ? defaultValue : value;
    }

    getSingularName(): string {
        return (<any>this.constructor).displayName
            ? _camelCase((<any>this.constructor).displayName)
            : _camelCase(this.constructor.name);
    }

    // override for special case like agency/agencies.
    // A pluralize library would be too slow and overkill for this simple purpose
    getPluralName(): string {
        return (<any>this.constructor).displayName
            ? _camelCase((<any>this.constructor).displayName) + 's'
            : _camelCase(this.constructor.name) + 's';
    }

    getDisplayName(): string {
        return (<any>this.constructor).displayName ? (<any>this.constructor).displayName : this.constructor.name;
    }

    getCapitalizedSingularName(): string {
        return (<any>this.constructor).displayName
            ? _upperFirst(_camelCase((<any>this.constructor).displayName))
            : _upperFirst(_camelCase(this.constructor.name));
    }

    // override for special case like agency/agencies.
    // A pluralize library would be too slow and overkill for this simple purpose
    getCapitalizedPluralName(): string {
        return (<any>this.constructor).displayName
            ? _upperFirst(_camelCase((<any>this.constructor).displayName)) + 's'
            : _upperFirst(_camelCase(this.constructor.name)) + 's';
    }
}
