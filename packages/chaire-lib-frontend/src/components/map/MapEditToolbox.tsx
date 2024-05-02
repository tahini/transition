/*
 * Copyright 2024, Polytechnique Montreal and contributors
 *
 * This file is licensed under the MIT License.
 * License text available at https://opensource.org/licenses/MIT
 */

import React from 'react';
import { withTranslation, WithTranslation } from 'react-i18next';
import { ViewMode, DrawPolygonMode, DrawRectangleMode } from '@nebula.gl/edit-modes';
import { faDrawPolygon } from '@fortawesome/free-solid-svg-icons/faDrawPolygon';
import { faVectorSquare } from '@fortawesome/free-solid-svg-icons/faVectorSquare';
import { faMousePointer } from '@fortawesome/free-solid-svg-icons/faMousePointer';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { IconDefinition } from '@fortawesome/fontawesome-svg-core';

const mapFeatures = ['selectPolygon', 'selectRectangle', 'view'] as const;

/** An enumeration of modes that can be routed */
export type MapFeature = typeof mapFeatures[number];
type SupportedFeaturesConfig = {
    mode: any;
    modeConfig?: any;
    icon: IconDefinition;
    title: string;
};

export const isSelectionMode = (mode: MapFeature): boolean => ['selectPolygon', 'selectRectangle'].includes(mode);

export const supportedFeatures: { [key in MapFeature]: SupportedFeaturesConfig } = {
    selectPolygon: {
        mode: DrawPolygonMode,
        icon: faDrawPolygon,
        title: 'SelectPolygonMode'
    },
    selectRectangle: {
        mode: DrawRectangleMode,
        modeConfig: {
            dragToDraw: true
        },
        icon: faVectorSquare,
        title: 'SelectRectangleMode'
    },
    view: {
        mode: ViewMode,
        icon: faMousePointer,
        title: 'DisplayMode'
    }
};

type ModeButtonProps = {
    buttonMode: MapFeature;
    currentMode: MapFeature;
    setMode: (mode: MapFeature) => void;
};

type MapEditToolboxProps = {
    currentMode: MapFeature;
    setMode: (mode: MapFeature) => void;
    /*canSelect: boolean;
    currentMode: any;*/
};

const ModeButtonNoTranslation: React.FunctionComponent<ModeButtonProps & WithTranslation> = ({
    buttonMode,
    currentMode,
    setMode,
    t
}) => (
    <button
        onClick={() => setMode(buttonMode)}
        className={`${buttonMode === currentMode ? 'selected' : ''}`}
        title={t(`main:${supportedFeatures[buttonMode].title}`)}
    >
        <FontAwesomeIcon icon={supportedFeatures[buttonMode].icon} />
    </button>
);

const ModeButton = withTranslation([])(ModeButtonNoTranslation);

const MapEditToolbox: React.FunctionComponent<MapEditToolboxProps & WithTranslation> = (
    props: MapEditToolboxProps & WithTranslation
) => {
    return (
        <div className="tr__map_toolbox">
            <ModeButton buttonMode={'selectPolygon'} currentMode={props.currentMode} setMode={props.setMode} />
            <ModeButton buttonMode={'selectRectangle'} currentMode={props.currentMode} setMode={props.setMode} />
            <ModeButton buttonMode={'view'} currentMode={props.currentMode} setMode={props.setMode} />
        </div>
    );
};

export default withTranslation([])(MapEditToolbox);
