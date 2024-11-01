/*
 * Copyright 2024, Polytechnique Montreal and contributors
 *
 * This file is licensed under the MIT License.
 * License text available at https://opensource.org/licenses/MIT
 */
import { useState, useCallback } from 'react';

import { BaseAttributesWithNumericId, BaseObject } from 'chaire-lib-common/lib/utils/objects/BaseObjectWithNumericId';
import { HistoryTracker } from 'chaire-lib-common/lib/utils/objects/HistoryTracker';

export type WithHistoryTracker<T extends BaseObject<BaseAttributesWithNumericId>> = {
    /**
     * Callback to call when the value of an object's attribute is changed. It
     * will handle and track the change. If the value is valid, it will update
     * the object
     * @param path The path of the attribute to change
     * @param newValue The value of the attribute and whether this value is
     * valid
     */
    onValueChange: <K extends keyof T['attributes']>(
        path: K,
        newValue: { value?: T[K] | null; valid?: boolean }
    ) => void;
    /**
     * Return whether there are changes to undo
     * @returns `true` if there are changes that can be undone
     */
    canUndo: () => boolean;
    /**
     * Undo the last change on the object. It actually updates the object
     */
    undo: () => void;
    /**
     * Return whether there are changes to redo
     * @returns `true` if there are changes that can be redone
     */
    canRedo: () => boolean;
    /**
     * Redo the last change on the object. It actually updates the object
     */
    redo: () => void;
    /**
     * Return whether there are invalid fields in the form
     * @returns `true` if there are invalid field values in the form
     */
    hasInvalidFields: () => boolean;
};

/**
 * Hook that tracks changes on an object and allows to undo/redo them
 *
 * @param object The object to track changes on
 * @returns
 */
export const useHistoryTracker = <T extends BaseObject<any>>(object: T): WithHistoryTracker<T> => {
    const [formValues, setFormValues] = useState<{ [key: string]: any }>(() => {
        const initialFormValues: { [key: string]: any } = {};
        for (const key in object.attributes) {
            if (object.attributes.hasOwnProperty(key)) {
                initialFormValues[key] = object.attributes[key];
            }
        }
        return initialFormValues;
    });
    const [invalidFields, setInvalidFields] = useState<Partial<Record<keyof T['attributes'], boolean>>>({});
    const [historyTracker] = useState(new HistoryTracker(object.attributes));

    const onFormFieldChange = useCallback(
        <K extends keyof T['attributes']>(
            path: K,
            newValue: { value?: T['attributes'][K] | null; valid?: boolean }
        ) => {
            setFormValues((prevFormValues) => ({ ...prevFormValues, [path]: newValue.value }));
            if (newValue.valid !== undefined && !newValue.valid) {
                setInvalidFields((prevInvalidFields) => ({ ...prevInvalidFields, [path]: true }));
            } else {
                setInvalidFields((prevInvalidFields) => ({ ...prevInvalidFields, [path]: false }));
            }
        },
        []
    );

    const onValueChange = useCallback(
        <K extends keyof T['attributes']>(
            path: K,
            newValue: { value?: T['attributes'][K] | null; valid?: boolean } = { value: null, valid: true }
        ) => {
            onFormFieldChange(path, newValue);
            if (newValue.valid || newValue.valid === undefined) {
                object.set(path as keyof T['attributes'], newValue.value);
                if (typeof object.validate === 'function') {
                    object.validate();
                }
                historyTracker.record(object.attributes);
            }
        },
        [onFormFieldChange, object, historyTracker]
    );

    const hasInvalidFields = useCallback((): boolean => {
        return Object.keys(invalidFields).filter((key) => invalidFields[key]).length > 0;
    }, [invalidFields]);

    const undo = useCallback(() => {
        const undoneAttributes = historyTracker.undo();
        if (undoneAttributes !== undefined) {
            object.mergeAttributes(undoneAttributes);
        }
    }, [historyTracker, object]);

    const canUndo = useCallback(() => historyTracker.canUndo(), [historyTracker]);

    const redo = useCallback(() => {
        const redoneAttributes = historyTracker.redo();
        if (redoneAttributes !== undefined) {
            object.mergeAttributes(redoneAttributes);
        }
    }, [historyTracker, object]);

    const canRedo = useCallback(() => historyTracker.canRedo(), [historyTracker]);

    return {
        onValueChange,
        canUndo,
        undo,
        canRedo,
        redo,
        hasInvalidFields
    };
};
