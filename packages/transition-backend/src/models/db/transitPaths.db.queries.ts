/*
 * Copyright 2022, Polytechnique Montreal and contributors
 *
 * This file is licensed under the MIT License.
 * License text available at https://opensource.org/licenses/MIT
 */
import type { Knex } from 'knex';
import knex from 'chaire-lib-backend/lib/config/shared/db.config';
import { validate as uuidValidate } from 'uuid';
import _cloneDeep from 'lodash/cloneDeep';
import knexPostgis from 'knex-postgis';
import { _isBlank } from 'chaire-lib-common/lib/utils/LodashExtensions';

import {
    exists,
    create,
    createMultiple,
    update,
    updateMultiple,
    deleteRecord,
    deleteMultiple,
    truncate,
    destroy,
    uuidsToArray
} from 'chaire-lib-backend/lib/models/db/default.db.queries';
import TrError from 'chaire-lib-common/lib/utils/TrError';
import Preferences from 'chaire-lib-common/lib/config/Preferences';
import type { PathAttributes } from 'transition-common/lib/services/path/Path';
import type {
    PathGeojsonProperties,
    PathQueryFilter,
    PathSummaryData
} from 'transition-common/lib/services/path/IPathRepository';
import type { PathDirection } from 'transition-common/lib/services/path/Path';
import {
    createDuplicateQueryWithIdMapping,
    joinWithClauses,
    getIdMappingQuery,
    getIdSelectionQuery,
    getQueryFilters,
    mapDuplicateIds
} from './utils.db.queries';

const tableName = 'tr_transit_paths';
const linesTableName = 'tr_transit_lines';
const agenciesTableName = 'tr_transit_agencies';
const schedulesTableName = 'tr_transit_schedules';
const periodsTableName = 'tr_transit_schedule_periods';
const tripsTableName = 'tr_transit_schedule_trips';
const scenariosServicesTableName = 'tr_transit_scenario_services';
const st = knexPostgis(knex);

type PathSummaryRow = {
    id: string;
    line_id: string;
    direction: PathDirection;
    name: string | null;
    mode: string | null;
    node_count: number;
    color: string;
};

/**
 * Convert a database summary row into a PathSummaryData
 *
 * @param row The database row
 * @returns The path summary data
 */
const toPathSummaryData = (row: PathSummaryRow): PathSummaryData => ({
    id: row.id,
    lineId: row.line_id,
    direction: row.direction,
    name: row.name ?? undefined,
    mode: row.mode ?? undefined,
    color: row.color,
    nodeCount: row.node_count
});

// TODO Type the return values
const attributesCleaner = function (attributes: Partial<PathAttributes>): { [key: string]: any } {
    const _attributes: any = _cloneDeep(attributes);
    if (_attributes.geography) {
        _attributes.geography = st.geomFromGeoJSON(JSON.stringify(attributes.geography));
    }
    delete _attributes.color;
    delete _attributes.mode;
    return _attributes;
};

const applyPathFilter = (query: Knex.QueryBuilder, pathFilter: PathQueryFilter): Knex.QueryBuilder => {
    if (pathFilter.agencyIds !== undefined) {
        query.whereIn('l.agency_id', uuidsToArray(pathFilter.agencyIds));
    }
    if (pathFilter.lineIds !== undefined) {
        query.whereIn('p.line_id', uuidsToArray(pathFilter.lineIds));
    }
    if (pathFilter.pathIds !== undefined) {
        query.whereIn('p.id', uuidsToArray(pathFilter.pathIds));
    }
    return query;
};

const getGeojsonLegacyBaseQuery = (noNullGeo?: boolean): Knex.QueryBuilder => {
    const query = knex(`${tableName} as p`)
        .leftJoin(`${linesTableName} as l`, 'p.line_id', 'l.id')
        .select(
            knex.raw(`
                p.id,
                p.geography,
                p.integer_id,
                json_build_object(
                  'id', p.id,
                  'internal_id', p.internal_id,
                  'direction', p.direction,
                  /*'agency_id', l.agency_id,*/
                  'line_id', p.line_id,
                  'name', p.name,
                  'is_frozen', p.is_frozen,
                  /*'geography', ST_AsGeoJSON(geography)::jsonb,*/
                  'data', p.data,
                  'description', p.description,
                  'is_enabled', p.is_enabled,
                  'created_at', p.created_at,
                  'updated_at', p.updated_at,
                  'integer_id', p.integer_id,
                  'nodes', COALESCE(p.nodes, '{}'),
                  'stops', COALESCE(p.stops, '{}'),
                  'segments', COALESCE(p.segments, '{}'),
                  'color', COALESCE(l.color, '${Preferences.current.transit.lines.defaultColor}'),
                  'mode', l.mode
                ) AS properties`)
        )
        .where('p.is_enabled', true)
        .orderBy('p.integer_id');
    if (noNullGeo === true) {
        query.whereNotNull('p.geography');
    }
    return query;
};

const geojsonCollectionFromQuery = async (query: Knex.QueryBuilder) => {
    // TODO: we should not fetch the whole data content, we should read path when modifying one instead of creating a Path from the geojson
    try {
        const featureQuery = knex
            .from(query.as('inputs'))
            .select(
                knex.raw(`
        jsonb_build_object(
            'type',       'Feature',
            'id',         inputs.integer_id,
            'geometry',   ST_AsGeoJSON(inputs.geography)::jsonb,
            'properties', inputs.properties
        ) as feature
        `)
            )
            .as('features');
        // FIXME: Previously, the feature collection was coalesced by the
        // database with `COALESCE(jsonb_agg(features.feature), '[]'::jsonb)`,
        // but it was not performant. Having typescript handle the coalescing
        // divides by 3 the time to fetch the data for large networks. See if we
        // can improve the query to have the DB do the coalescing
        const features = await featureQuery;
        const geojson = {
            type: 'FeatureCollection' as const,
            features: features.map((f: any) => f.feature)
        };
        return geojson;
    } catch (error) {
        throw new TrError(
            `cannot fetch transit paths geojson collection because of a database error (knex error: ${error})`,
            'TPQPGC0002',
            'TransitPathsGeojsonCollectionCouldNotBeFetchedBecauseDatabaseError'
        );
    }
};

// TODO The noNullGeo should be the default, as null geography should not be acceptable, but the application's PathCollection expects all paths to be there. We'll need to update quite a few things before having noNullGeo by default and always. See #1740
const geojsonCollectionLegacy = async (
    params: { scenarioId?: string; noNullGeo?: boolean; lineIds?: string[]; agencyIds?: string[] } = {}
): Promise<GeoJSON.FeatureCollection<GeoJSON.LineString>> => {
    const baseQuery = getGeojsonLegacyBaseQuery(params.noNullGeo);
    // TODO Replace those params by eventual calls to more specific methods like getPathsForScenario
    if (params.scenarioId) {
        baseQuery
            .innerJoin(`${tripsTableName} as trips`, 'trips.path_id', 'p.id')
            .innerJoin(`${periodsTableName} as periods`, 'periods.id', 'trips.schedule_period_id')
            .innerJoin(`${schedulesTableName} as sched`, 'sched.id', 'periods.schedule_id')
            .innerJoin(`${scenariosServicesTableName} as sc`, 'sched.service_id', 'sc.service_id')
            .andWhere('sc.scenario_id', params.scenarioId)
            .groupBy('p.id', 'l.color', 'l.mode');
    }
    return await geojsonCollectionFromQuery(baseQuery);
};

const geojsonCollectionForServices = async (
    serviceIds: string[]
): Promise<GeoJSON.FeatureCollection<GeoJSON.LineString>> => {
    if (serviceIds.length === 0) {
        return { type: 'FeatureCollection' as const, features: [] };
    }
    const baseQuery = getGeojsonLegacyBaseQuery(true);
    baseQuery
        .innerJoin(`${tripsTableName} as trips`, 'trips.path_id', 'p.id')
        .innerJoin(`${periodsTableName} as periods`, 'periods.id', 'trips.schedule_period_id')
        .innerJoin(`${schedulesTableName} as sched`, 'sched.id', 'periods.schedule_id')
        .whereIn('sched.service_id', serviceIds)
        .groupBy('p.id', 'l.color', 'l.mode');
    return await geojsonCollectionFromQuery(baseQuery);
};

const getGeojsonBaseQuery = (params: PathQueryFilter): Knex.QueryBuilder => {
    const query = knex(`${tableName} as p`)
        .innerJoin(`${linesTableName} as l`, 'p.line_id', 'l.id')
        .innerJoin(`${agenciesTableName} as a`, 'l.agency_id', 'a.id')
        .select(
            'p.id',
            'p.integer_id',
            'p.line_id',
            'p.direction',
            'p.name',
            'l.mode',
            'l.color',
            'l.shortname',
            'l.longname',
            'a.acronym',
            st.asGeoJSON('p.geography').as('geometry')
        )
        .where('p.is_enabled', true)
        .orderBy('p.integer_id');
    query.whereNotNull('p.geography');
    return applyPathFilter(query, params);
};

/**
 * Get a geojson collection with minimal path information
 *
 * FIXME legacy feature collection has this TODO: "Replace those params by
 * eventual calls to more specific methods like getPathsForScenario". We need to
 * decide if we want multiple geojson collection getters, that we could add to
 * the IPathRepository interface, of a single one with filter. For now, just
 * support the basic filters.
 *
 * @param params
 * @returns
 */
const geojsonCollection = async (
    params: PathQueryFilter = {}
): Promise<GeoJSON.FeatureCollection<GeoJSON.LineString, PathGeojsonProperties>> => {
    const baseQuery = getGeojsonBaseQuery(params);
    const rows = await baseQuery;
    return {
        type: 'FeatureCollection',
        features: rows.map((row) => ({
            type: 'Feature',
            id: row.integer_id,
            geometry: JSON.parse(row.geometry),
            properties: {
                id: row.id,
                mode: row.mode ?? undefined,
                lineId: row.line_id,
                direction: row.direction,
                name: row.name ?? undefined,
                color: row.color ?? Preferences.current.transit.lines.defaultColor,
                lineShortname: row.shortname ?? undefined,
                lineName: row.longname ?? undefined,
                agencyAcronym: row.acronym ?? undefined
            }
        }))
    };
};

const getPathBaseQuery = (): Knex.QueryBuilder =>
    knex(`${tableName} as p`)
        .leftJoin(`${linesTableName} as l`, 'p.line_id', 'l.id')
        .select(
            'p.*',
            knex.raw('COALESCE(p.nodes, \'{}\') as nodes'),
            knex.raw('COALESCE(p.stops, \'{}\') as stops'),
            knex.raw('COALESCE(p.segments, \'{}\') as segments'),
            knex.raw('COALESCE(l.color, ?) as color', [Preferences.current.transit.lines.defaultColor]),
            knex.raw('ST_AsGeoJSON(p.geography)::jsonb as geography')
        )
        .where('p.is_enabled', true);

const collection = async () => {
    return readObjects();
};

const readObjects = async (pathFilter: PathQueryFilter = {}): Promise<PathAttributes[]> => {
    try {
        const objects = await applyPathFilter(getPathBaseQuery(), pathFilter).orderBy('p.integer_id');
        if (objects) {
            return objects;
        }
        throw new TrError(
            'cannot fetch transit paths objects because database did not return a valid geojson',
            'TPQC0001',
            'TransitPathObjectsCouldNotBeFetchedBecauseDatabaseError'
        );
    } catch (error) {
        throw new TrError(
            `cannot fetch transit paths objects because of a database error (knex error: ${error})`,
            'TPQC0002',
            'TransitPathObjectsCouldNotBeFetchedBecauseDatabaseError'
        );
    }
};

const summaries = async (pathFilter: PathQueryFilter = {}): Promise<PathSummaryData[]> => {
    try {
        // FIXME Summary should also display some stat data, like total time and/or distance
        const query = knex(`${tableName} as p`)
            .leftJoin(`${linesTableName} as l`, 'p.line_id', 'l.id')
            .select(
                'p.id',
                'p.line_id',
                'p.direction',
                'p.name',
                'l.mode',
                knex.raw('COALESCE(cardinality(p.nodes), 0) as node_count'),
                knex.raw('COALESCE(l.color, ?) as color', [Preferences.current.transit.lines.defaultColor])
            )
            .where('p.is_enabled', true);
        const rows = await applyPathFilter(query, pathFilter).orderBy('p.integer_id');
        if (rows) {
            return rows.map(toPathSummaryData);
        }
        throw new TrError(
            'cannot fetch transit paths summaries because database did not return a valid geojson',
            'TPQS0001',
            'TransitPathSummariesCouldNotBeFetchedBecauseDatabaseError'
        );
    } catch (error) {
        throw new TrError(
            `cannot fetch transit paths summaries because of a database error (knex error: ${error})`,
            'TPQS0002',
            'TransitPathSummariesCouldNotBeFetchedBecauseDatabaseError'
        );
    }
};

const read = async (id: string) => {
    try {
        if (!uuidValidate(id)) {
            throw new TrError(
                `Cannot read object from table ${tableName} because the required parameter id is missing, blank or not a valid uuid`,
                'DBQRDP0001',
                'DatabaseCannotReadTransitPathBecauseIdIsMissingOrInvalid'
            );
        }
        const rows = await getPathBaseQuery().where('p.id', id).orderBy('p.integer_id');
        if (rows.length !== 1) {
            throw new TrError(
                `Cannot find object with id ${id} from table ${tableName}`,
                'DBQRDP0002',
                'DatabaseCannotReadTransitPathBecauseObjectDoesNotExist'
            );
        }
        return rows[0];
    } catch (error) {
        throw new TrError(
            `Cannot read object with id ${id} from table ${tableName} (knex error: ${error})`,
            'DBQRDP0003',
            'DatabaseCannotReadTransitPathBecauseDatabaseError'
        );
    }
};

/**
 * Duplicate paths, possibly for a specific line mapping for lines.
 * Either an array of path, or a lineMapping must be specified.
 *
 * @param param The parameter object
 * @param param.pathIds The path IDs to duplicate
 * @param param.lineIdMapping The mapping of original line IDs to new line IDs
 * @param param.transaction The transaction to use for the duplication, if any
 * @returns A mapping of the ID of the paths copied to the ID of the copy.
 */
const duplicate = async ({
    pathIds: requestedPathIds = [],
    lineIdMapping = {},
    newPathSuffix = '',
    transaction
}: {
    pathIds?: string[];
    lineIdMapping?: { [key: string]: string };
    newPathSuffix?: string;
    transaction?: Knex.Transaction;
}): Promise<{ [originalPathId: string]: string }> => {
    try {
        // Deduplicate path ids, in case a path is requested twice
        const pathIds = [...new Set(requestedPathIds)];
        if (Object.keys(lineIdMapping).length === 0 && pathIds.length === 0) {
            throw new Error(
                'There needs to be either a line mapping or an array of path ids to duplicate, none provided.'
            );
        }
        // Validate that mappings and arrays are all uuids
        Object.entries(lineIdMapping).forEach(([originalId, mappedId]) => {
            if (!uuidValidate(originalId) || !uuidValidate(mappedId)) {
                throw new Error('Line mappings must be valid uuids');
            }
        });
        pathIds.forEach((pathId) => {
            if (!uuidValidate(pathId)) {
                throw new Error('Path ids must be valid uuids');
            }
        });

        const lineMappingQuery = getIdMappingQuery(lineIdMapping, 'line', tableName);
        const pathSelectionQuery = getIdSelectionQuery(pathIds, tableName);

        // Nested function to require a transaction around the duplication
        const duplicateWithTransaction = async (trx: Knex.Transaction) => {
            // These queries are inspired by both
            // https://stackoverflow.com/questions/29256888/insert-into-from-select-returning-id-mappings
            // and
            // https://dba.stackexchange.com/questions/46410/how-do-i-insert-a-row-which-contains-a-foreign-key
            // so that a single query can copy for many lines and path ids

            // Query to copy the requested paths for the requested lines if any.
            // Using raw as it is complex to put in knex
            const pathName = _isBlank(newPathSuffix) ? 'name' : 'name || ?';
            const withClauses = joinWithClauses([lineMappingQuery, pathSelectionQuery]);
            const duplicatePathsQuery = `${withClauses.query}\
                insert into ${tableName}(internal_id, direction, line_id, name, is_enabled, geography, nodes, stops, segments, description, data, is_frozen) \
                    select internal_id, direction, ${lineMappingQuery.mappedField}, ${pathName}, is_enabled, geography, nodes, stops, segments, description, data, is_frozen
                    from ${tableName} \
                    ${lineMappingQuery.mappedJoin} \
                    ${pathSelectionQuery.mappedJoin} \
                    order by integer_id returning id, integer_id`;

            // Put the where queries and bindings for lines and services in arrays to better join them if necessary in the query
            const pathWhereQueries = getQueryFilters([lineMappingQuery, pathSelectionQuery]);

            const pathIdMapping = await knex
                .raw(
                    createDuplicateQueryWithIdMapping(
                        tableName,
                        duplicatePathsQuery,
                        pathWhereQueries.whereClauses.join(' and '),
                        'integer_id'
                    ),
                    [
                        ...pathWhereQueries.bindings,
                        ...withClauses.bindings,
                        ...(_isBlank(newPathSuffix) ? [] : [newPathSuffix])
                    ]
                )
                .transacting(trx);

            if (pathIdMapping.rows.length === 0) {
                return {};
            }

            return mapDuplicateIds<string>(pathIdMapping.rows);
        };
        // Make sure the update is done in a transaction, use the one in the options if available
        return transaction
            ? await duplicateWithTransaction(transaction)
            : await knex.transaction(duplicateWithTransaction);
    } catch (error) {
        throw new TrError(
            `Cannot duplicate paths for lines ${JSON.stringify(lineIdMapping)} and path ids ${requestedPathIds} in database (knex error: ${error})`,
            'DBPATH0003',
            'TransitPathCannotUpdateBecauseDatabaseError'
        );
    }
};

export default {
    exists: exists.bind(null, knex, tableName),
    read,
    create: async (newObject: PathAttributes, options?: Parameters<typeof create>[4]) =>
        create(knex, tableName, attributesCleaner, newObject, options),
    createMultiple: async (newObjects: PathAttributes[], options?: Parameters<typeof createMultiple>[4]) =>
        createMultiple(knex, tableName, attributesCleaner, newObjects, options),
    update: async (id: string, updatedObject: Partial<PathAttributes>, options?: Parameters<typeof update>[5]) =>
        update(knex, tableName, attributesCleaner, id, updatedObject, options),
    updateMultiple: async (updatedObjects: Partial<PathAttributes>[], options?: Parameters<typeof updateMultiple>[4]) =>
        updateMultiple(knex, tableName, attributesCleaner, updatedObjects, options),
    delete: async (id: string, options?: Parameters<typeof deleteRecord>[3]) =>
        deleteRecord(knex, tableName, id, options),
    deleteMultiple: async (ids: string[], options?: Parameters<typeof deleteMultiple>[3]) =>
        deleteMultiple(knex, tableName, ids, options),
    truncate: truncate.bind(null, knex, tableName),
    destroy: destroy.bind(null, knex),
    /**
     * @deprecated Use the `summaries` function instead to get summarized data,
     * suitable for listing, or `readObjects` to get complete objects data.
     * Previous behavior was the `readObjects` function
     */
    collection,
    readObjects,
    summaries,
    /**
     * @deprecated This function should not be used to get all the path data.
     * Use `geojsonCollectionNew` to get minimal geojson data
     */
    geojsonCollection: geojsonCollectionLegacy,
    geojsonCollectionNew: geojsonCollection,
    geojsonCollectionForServices,
    duplicate
};
