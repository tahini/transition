/*
 * Copyright 2022, Polytechnique Montreal and contributors
 *
 * This file is licensed under the MIT License.
 * License text available at https://opensource.org/licenses/MIT
 */

import { lineOffset, lineOverlap, lineString, LineString, Feature, Polygon, booleanPointInPolygon } from '@turf/turf';

interface OverlappingSegments {
    geoData: GeoJSON.Feature<LineString>;
    crossingLines: number[];
    directions: boolean[];
}

/**
 * Obtains the lines from a paths layer that have at least one coordinate inside the viewport.
 * @param bounds - a bounding box Polygon that represents the viewport's coordinates
 * @param layer - the paths layer that we want to get the visible lines from
 * @return A collection of the lines that are in the viewport
 */
export const getLinesInView = (
    bounds: Feature<Polygon>,
    layer: GeoJSON.FeatureCollection<LineString>
): GeoJSON.FeatureCollection<LineString> => {
    const features = layer.features;
    const linesInView: GeoJSON.FeatureCollection<LineString> = { type: 'FeatureCollection', features: [] };
    for (let i = 0; i < features.length; i++) {
        for (let j = 0; j < features[i].geometry.coordinates.length; j++) {
            if (isInBounds(bounds, features[i].geometry.coordinates[j])) {
                linesInView.features.push(features[i]);
                break;
            }
        }
    }
    return linesInView;
};

const isInBounds = (bounds: Feature<Polygon>, coord: number[]): boolean => {
    return booleanPointInPolygon(coord, bounds);
};

/**
 * Orchestrates the relocation of offsetting of overlapping lines.
 * @param layerData - a LineString feature collection giving a reference to the correct paths layer
 * @return The same layer after the lines have been offset and made more aesthetically pleasing
 */
export const manageOverlappingLines = (
    layerData: GeoJSON.FeatureCollection<LineString>,
): GeoJSON.FeatureCollection<LineString> => {
    const overlapMap = findOverlapingLines(layerData);
    const overlapArray = manageOverlapingSegmentsData(overlapMap, layerData);
    applyOffset(overlapArray, layerData);
    return cleanLines(layerData);
};

const cleanLines = (layerData: GeoJSON.FeatureCollection<LineString>): GeoJSON.FeatureCollection<LineString> => {
    layerData.features.forEach((feature) => {
        feature.geometry.coordinates = feature.geometry.coordinates.filter((value) => {
            return !Number.isNaN(value[0]) && !Number.isNaN(value[1]);
        });
    });
    return layerData;
};

const applyOffset = (overlapArray: OverlappingSegments[], layerData: GeoJSON.FeatureCollection<LineString>): void => {
    for (let i = 0; i < overlapArray.length; i++) {
        const nbOverlapped = overlapArray[i].directions.length;
        let oppositeDirectionOffset = 0;
        let sameDirectionOffset = 0;
        for (let j = 0; j < nbOverlapped; j++) {
            const segment = overlapArray[i].geoData;
            if (overlapArray[i].directions[j]) {
                const offsetLine = lineOffset(segment, 3 * sameDirectionOffset, { units: 'meters' });
                replaceCoordinate(segment, offsetLine, overlapArray[i].crossingLines[j], layerData);
                sameDirectionOffset++;
            } else {
                const reverseCoordinates = segment.geometry.coordinates.slice().reverse();
                const reverseLine = segment;
                reverseLine.geometry.coordinates = reverseCoordinates;
                const offsetLine = lineOffset(reverseLine, 3 * oppositeDirectionOffset, { units: 'meters' });
                replaceCoordinate(reverseLine, offsetLine, overlapArray[i].crossingLines[j], layerData);
                oppositeDirectionOffset++;
            }
        }
    }
};

const replaceCoordinate = (
    lineToReplace: GeoJSON.Feature<LineString>,
    offsetLine: GeoJSON.Feature<LineString>,
    lineId: number,
    layerData: GeoJSON.FeatureCollection<LineString>
): void => {
    const line = layerData.features[lineId];
    const oldCoordinates = lineToReplace.geometry.coordinates;
    const length = oldCoordinates.length;
    // We go through the coordinates of every single LineString until we reach the starting point of the segment we want to replace
    for (let i = 0; i < line.geometry.coordinates.length; i++) {
        let match = true;
        oldCoordinates.forEach((oldCoord, index) => {
            if (i + index >= line.geometry.coordinates.length) {
                match = false;
            } else {
                const lineCoord = line.geometry.coordinates[i + index];
                if (lineCoord[0] !== oldCoord[0] || lineCoord[1] !== oldCoord[1]) {
                    match = false;
                }
            }
        });

        if (match) {
            for (let j = 0; j < length; j++) {
                line.geometry.coordinates[i + j] = offsetLine.geometry.coordinates[j];
            }
            break;
        }
    }
};

const findOverlapingLines = (layerData: GeoJSON.FeatureCollection<LineString>): Map<string, Set<number>> => {
    const features = layerData.features;
    // The map contains the feature and a set of numbers
    // The feature is the segment concerned by the overlap
    // The set of numbers is a set that contains the IDs of every single line concerned by the overlap on that segment
    const overlapMap: Map<string, Set<number>> = new Map();
    for (let i = 0; i < features.length - 1; i++) {
        for (let j = i + 1; j < features.length; j++) {
            const overlap = lineOverlap(
                lineString(features[i].geometry.coordinates),
                lineString(features[j].geometry.coordinates)
            );
            if (overlap.features.length === 0) continue;
            for (const segment of overlap.features) {
                const overlapStr = JSON.stringify(segment);
                if (!overlapMap.has(overlapStr)) overlapMap.set(overlapStr, new Set());
                overlapMap.get(overlapStr)?.add(i).add(j);
            }
        }
    }
    return overlapMap;
};

const manageOverlapingSegmentsData = (overlapMap: Map<string, Set<number>>, layerData: GeoJSON.FeatureCollection<LineString>): OverlappingSegments[] => {
    const overlapArray: OverlappingSegments[] = [];
    overlapMap.forEach((value: any, key: any) => {
        const segmentDirections: Array<boolean> = [];
        const keyGeojson = JSON.parse(key);
        value.forEach((id: number) => {
            const data = layerData.features[id];
            const coordinates = keyGeojson.geometry.coordinates;
            const firstPoint = coordinates[0];
            const lastPoint = coordinates[coordinates.length - 1];
            for (let i = 0; i < data.geometry.coordinates.length; i++) {
                const actualPoint = data.geometry.coordinates[i];
                if (actualPoint[0] === firstPoint[0] && actualPoint[1] === firstPoint[1]) {
                    segmentDirections.push(true);
                    break;
                } else if (actualPoint[0] === lastPoint[0] && actualPoint[1] === lastPoint[1]) {
                    segmentDirections.push(false);
                    break;
                }
            }
        });
        const overlap: OverlappingSegments = {
            geoData: keyGeojson,
            crossingLines: Array.from(value),
            directions: segmentDirections
        };
        overlapArray.push(overlap);
    });
    return overlapArray;
};

