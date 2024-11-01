/*
 * Copyright 2024, Polytechnique Montreal and contributors
 *
 * This file is licensed under the MIT License.
 * License text available at https://opensource.org/licenses/MIT
 */
import { renderHook, act } from '@testing-library/react-hooks';

import { useHistoryTracker } from '../useHistoryTracker';
import { BaseAttributesWithNumericId, BaseObject } from 'chaire-lib-common/lib/utils/objects/BaseObjectWithNumericId';

type TestAttributes = BaseAttributesWithNumericId & {
    field1: string;
};

class TestObject extends BaseObject<TestAttributes> {
    protected _validate(): [boolean, string[]] {
        return [true, []];
    }
    protected _prepareAttributes(attributes: Partial<TestAttributes>): TestAttributes {
        return {
            id: -1,
            uuid: 'test',
            field1: '',
            ...attributes
        }
    }
};

describe('useHistoryTracker hook', () => {
    let initialObject: TestObject;

    beforeEach(() => {
        initialObject = new TestObject({ id: -1, uuid: 'test', field1: 'test' });
    });

    test('Update field1 with valid value', () => {
        const { result } = renderHook(() => useHistoryTracker(initialObject));

        // Check initial value
        expect(initialObject.attributes.field1).toBe('test');

        // Call onValueChange
        act(() => {
            result.current.onValueChange('field1', { value: 'new value', valid: true });
        });

        // Check updated value
        expect(initialObject.attributes.field1).toBe('new value');
    });

    test('Update field1 with invalid value', () => {
        const { result } = renderHook(() => useHistoryTracker(initialObject));

        // Check initial value
        expect(initialObject.attributes.field1).toBe('test');

        // Call onValueChange
        act(() => {
            result.current.onValueChange('field1', { value: 'new value', valid: false });
        });

        // Check updated value
        expect(initialObject.attributes.field1).toBe('test');
    });

    test('Cannot undo/redo when no changes', () => {
        const { result } = renderHook(() => useHistoryTracker(initialObject));

        // Check initial value
        expect(initialObject.attributes.field1).toBe('test');
        
        // Should return false for undo/redo
        expect(result.current.canUndo()).toBe(false);
        expect(result.current.canRedo()).toBe(false);

        // Undo/redo should have no effect
        act(() => {
            result.current.undo();
        });
        expect(initialObject.attributes.field1).toBe('test');
        act(() => {
            result.current.redo();
        });
        expect(initialObject.attributes.field1).toBe('test');
    });

    test('Should undo previous changes', () => {
        const { result } = renderHook(() => useHistoryTracker(initialObject));

        // Check initial value
        expect(initialObject.attributes.field1).toBe('test');

        // Call onValueChange twice
        const updatedValue1 = 'new value 1';
        const updatedValue2 = 'new value 2';
        act(() => {
            result.current.onValueChange('field1', { value: updatedValue1, valid: true });
            result.current.onValueChange('field1', { value: updatedValue2, valid: true });
        });
        
        // Should be able to undo
        expect(result.current.canUndo()).toBe(true);

        // Undo last change
        act(() => {
            result.current.undo();
        });
        expect(initialObject.attributes.field1).toBe(updatedValue1);

        // Should still be able to undo
        expect(result.current.canUndo()).toBe(true);

        // Undo another change
        act(() => {
            result.current.undo();
        });
        expect(initialObject.attributes.field1).toBe('test');

        // No more undo
        expect(result.current.canUndo()).toBe(false);
    });

    test('Should redo undone changes', () => {
        const { result } = renderHook(() => useHistoryTracker(initialObject));

        // Check initial value
        expect(initialObject.attributes.field1).toBe('test');

        // Call onValueChange twice
        const updatedValue1 = 'new value 1';
        const updatedValue2 = 'new value 2';
        act(() => {
            result.current.onValueChange('field1', { value: updatedValue1, valid: true });
            result.current.onValueChange('field1', { value: updatedValue2, valid: true });
        });

        // Undo twice
        act(() => {
            result.current.undo();
            result.current.undo();
        });

        // Should be able to redo
        expect(result.current.canRedo()).toBe(true);

        // Redo last change
        act(() => {
            result.current.redo();
        });
        expect(initialObject.attributes.field1).toBe(updatedValue1);

        // Should still be able to redo
        expect(result.current.canRedo()).toBe(true);

        // Redo another change
        act(() => {
            result.current.redo();
        });
        expect(initialObject.attributes.field1).toBe(updatedValue2);

        // No more redo
        expect(result.current.canRedo()).toBe(false);
    });

    test('Update field1 with valid value and check invalid fields', () => {
        const { result } = renderHook(() => useHistoryTracker(initialObject));

        // Call onValueChange
        act(() => {
            result.current.onValueChange('field1', { value: 'new value', valid: true });
        });

        // Check that there are no invalid fields
        expect(result.current.hasInvalidFields()).toBe(false);
    });

    test('Update field1 with invalid value and check invalid fields', () => {
        const { result } = renderHook(() => useHistoryTracker(initialObject));

        // Call onValueChange with invalid value
        act(() => {
            result.current.onValueChange('field1', { value: 'new value', valid: false });
        });

        // Check that there are invalid fields
        expect(result.current.hasInvalidFields()).toBe(true);
    });
});