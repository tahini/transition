/*
 * Copyright 2024, Polytechnique Montreal and contributors
 *
 * This file is licensed under the MIT License.
 * License text available at https://opensource.org/licenses/MIT
 */
import { v4 as uuidV4 } from 'uuid';
import { BaseObject, BaseAttributesWithNumericId } from '../BaseObjectWithNumericId';
import exp from 'constants';

interface TestAttributes extends BaseAttributesWithNumericId {
    name: string;
}

class TestObject extends BaseObject<TestAttributes> {
    protected _validate(): [boolean, string[]] {
        const errors: string[] = [];
        if (!this.attributes.name) {
            errors.push('Name is required');
        }
        return [errors.length === 0, errors];
    }
}

let attributes: TestAttributes;

beforeEach(() => {
    attributes = {
        id: 1,
        uuid: uuidV4(),
        name: 'Test Object',
        is_frozen: false,
        created_at: '2022-01-01',
        updated_at: '2022-01-02'
    };
});

test('should create a new object with default attributes', () => {
    const obj = new TestObject({});
    expect(obj.id).toBe(-1);
    expect(obj.uuid).toBeDefined();
    expect(obj.isFrozen()).toBe(false);
    expect(obj.isNew()).toBe(true);
});

test('should create object with attributes correctly', () => {
    const obj = new TestObject(attributes);
    expect(obj.id).toBe(attributes.id);
    expect(obj.uuid).toBe(attributes.uuid);
    expect(obj.attributes.name).toBe(attributes.name);
});

test('should merge attributes correctly', () => {
    const obj = new TestObject(attributes);
    obj.mergeAttributes({ name: 'Updated Name' });
    expect(obj.attributes.name).toBe('Updated Name');
});

test('should clone object correctly', () => {
    const obj = new TestObject(attributes);
    const clonedObj = obj.clone();
    expect(clonedObj.attributes.id).toBe(-1);
    expect(clonedObj.attributes.uuid).not.toBe(obj.uuid);
    expect(clonedObj.attributes.name).toBe(obj.attributes.name);
    expect(clonedObj.isNew()).toBe(true);
});

test('should clone object correctly, without deleting specifics', () => {
    const obj = new TestObject(attributes);
    const clonedObj = obj.clone(false, false);
    expect(clonedObj.attributes.id).toBe(attributes.id);
    expect(clonedObj.attributes.uuid).toBe(attributes.uuid);
    expect(clonedObj.attributes.name).toBe(obj.attributes.name);
    expect(clonedObj.isNew()).toBe(false);
});

test('should validate object correctly', () => {
    const obj = new TestObject(attributes);
    expect(obj.validate()).toBe(true);
    expect(obj.getErrors()).toHaveLength(0);
    expect(obj.isValid).toBe(true);
    expect(obj.getErrors()).toHaveLength(0);

    const invalidObj = new TestObject({ id: 1, uuid: uuidV4() });
    expect(invalidObj.validate()).toBe(false);
    expect(invalidObj.getErrors()).toContain('Name is required');
    expect(invalidObj.isValid).toBe(false);
    expect(invalidObj.getErrors()).toEqual(['Name is required']);
});

test('should set and get attributes correctly', () => {
    const obj = new TestObject(attributes);
    expect(obj.attributes).toEqual(attributes);
    obj.set('name', 'New Name');
    expect(obj.get('name')).toBe('New Name');
    expect(obj.attributes).toEqual({ ...attributes, name: 'New Name' });
});

test('should handle deletion correctly', () => {
    const obj = new TestObject(attributes);
    expect(obj.isDeleted()).toBe(false);
    obj.setDeleted();
    expect(obj.isDeleted()).toBe(true);
});

test('should get correct display names', () => {
    const obj = new TestObject(attributes);
    expect(obj.getSingularName()).toBe('testObject');
    expect(obj.getPluralName()).toBe('testObjects');
    expect(obj.getCapitalizedSingularName()).toBe('TestObject');
    expect(obj.getCapitalizedPluralName()).toBe('TestObjects');
});

describe('frozen objects', () => {

    test('frozen objects should be frozen', () => {
        // Create a frozen object
        attributes.is_frozen = true;
        const obj = new TestObject(attributes);
        expect(obj.isFrozen()).toBe(true);
    });

    test('should not update frozen objects', () => {
        // Create a frozen object
        attributes.is_frozen = true;
        const obj = new TestObject(attributes);
        expect(() => obj.set('name', 'New name')).toThrow('Cannot set name on a frozen object');
        expect(() => obj.mergeAttributes({ name: 'New name' })).toThrow('Cannot merge attributes on a frozen object');
    });

    test('should be able to set the is_frozen and then update object', () => {
        // Create a frozen object
        attributes.is_frozen = true;
        const obj = new TestObject(attributes);
        obj.set('is_frozen', false);
        obj.set('name', 'New name');
        expect(obj.attributes).toEqual({ ...attributes, name: 'New name', is_frozen: false });
    });

    test('should be able to mergeAttributes with is_frozen to false and then update object', () => {
        // Create a frozen object
        attributes.is_frozen = true;
        const obj = new TestObject(attributes);
        obj.mergeAttributes({ is_frozen: false, name: 'New name' });
        expect(obj.attributes).toEqual({ ...attributes, name: 'New name', is_frozen: false });
    });
})
