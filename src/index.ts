import { Schema, DocumentQuery } from 'mongoose'

declare module 'mongoose' {
  interface DocumentQuery<T, DocType extends Document> {
    queryDataTable: (params: Partial<QueryOptions>) => Promise<PaginatedResult>
    dataTable: (params: Partial<QueryOptions>) => Promise<PaginatedResult>
    dataTableGetFilterList: (field: string) => Promise<QueryFilterResult[]>
    dataTableSearch: (
      filter: string,
      params: object
    ) => DocumentQuery<any, any, any>
    dataTableFilter: (terms: string) => DocumentQuery<any, any, any>
    dataTablePaginate: (
      _page?: number | string,
      _itemsPerPage?: number | string
    ) => DocumentQuery<any, any, any>
    dataTablePaginated: (
      _page?: number | string,
      _itemsPerPage?: number | string
    ) => Promise<PaginatedResult>
    dataTableSort: (
      _sortBy: string,
      _sortDesc: string
    ) => DocumentQuery<any, any, any>
  }
}

interface Query extends DocumentQuery<any, any, any> {
  model: any
  _conditions: any
}

export interface DataTableOptions {
  page: number
  itemsPerPage: number
  searchOptions: object
  sortBy: string[]
  sortDesc: boolean[]
  groupBy: string[]
  groupDesc: boolean[]
  multiSort: boolean
  mustSort: boolean
}

export interface QueryOptions {
  page: number
  itemsPerPage: number
  getFilterList: string
  filter: string
  search: string
  searchOptions: object
  sortBy: string
  sortDesc: string
  groupBy: string
  groupDesc: string
  multiSort: boolean
  mustSort: boolean
}

export interface DataTableHeader {
  text: string
  value: string
  align?: 'start' | 'center' | 'end'
  sortable?: boolean
  filterable?: boolean
  groupable?: boolean
  divider?: boolean
  class?: string | string[]
  width?: string | number
  filter?: (value: any, search: string, item: any) => boolean
  sort?: (a: any, b: any) => number
  $custom?: object
}

export interface PaginatedResult {
  data: object[]
  resultCount: number
  totalCount: number
}

export interface QueryFilterPayload {
  [key: string]: string | RegExp
}

export interface QueryFilterResult {
  count: number
  value: unknown
}

export default (schema: Schema, _options = {}): void => {
  const options = {
    defaultItemsPerPage: 10,
    ..._options,
  }
  const { query } = schema
  const queryExtension: Partial<Query> = {
    dataTableSearch(this: Query, search: string, params = {}): Query {
      const { _conditions }: any = this
      return !search
        ? this
        : this.find({
            $and: [
              { ..._conditions },
              {
                $text: {
                  $search: search,
                  ...params,
                },
              },
            ],
          })
    },
    dataTableSort(this: Query, _sortBy = '', _sortDesc = ''): Query {
      if (!_sortBy.length) return this
      const sortBy = _sortBy.split(',')
      const sortDesc = _sortDesc
        .split(',')
        .map((value) => value.toLowerCase() === 'true')
      const sort = sortBy.reduce(
        (acc, key, index) => ({
          ...acc,
          [key]: sortDesc[index] ? -1 : 1,
        }),
        {}
      )
      return this.sort(sort)
    },
    dataTablePaginate(
      this: Query,
      _page: number | string = 1,
      _itemsPerPage: number | string = 0
    ): Query {
      const page =
        (typeof _page === 'string' ? Number.parseInt(_page, 10) : _page ?? 1) -
        1
      const itemsPerPage =
        typeof _itemsPerPage === 'string'
          ? Number.parseInt(_itemsPerPage, 10)
          : _itemsPerPage ?? options.defaultItemsPerPage
      const limit = itemsPerPage < 0 ? 0 : itemsPerPage
      const skip = (page < 0 ? 0 : page) * limit
      return this.skip(skip).limit(limit)
    },
    async dataTablePaginated(
      this: Query,
      _page: number | string = 1,
      _itemsPerPage: number | string = 0
    ): Promise<PaginatedResult> {
      const [data, resultCount, totalCount] = await Promise.all([
        this.dataTablePaginate(_page, _itemsPerPage),
        this.model.countDocuments(this._conditions),
        this.model.countDocuments(),
      ])
      return {
        data,
        resultCount,
        totalCount,
      }
    },
    dataTableFilter(this: Query, terms: string): Query {
      if (!terms || !terms.length) return this
      const operations = {
        match(field: string, value: string, flags = ''): QueryFilterPayload {
          const payload = flags === 'i' ? new RegExp(`^${value}$`, 'i') : value
          return { [field]: payload }
        },
        contains(field: string, value: string, flags = ''): QueryFilterPayload {
          const payload = new RegExp(value, flags === 'i' ? 'ig' : 'g')
          return { [field]: payload }
        },
      }
      const allowedOperators = [
        'lte',
        'lt',
        'gt',
        'gte',
        'in',
        'nin',
        'eq',
        'ne',
        'exists',
        'type',
      ]
      const matchFilters = /(([,;])|([^()]+\([^)]+\)))/g
      const matchParams = /^(.*)\((.*)\)$/

      const filters = terms.match(matchFilters)

      if (filters === null) return this

      const orBlocks = []
      let andBlocks = []
      for (let i = 0; i < filters.length; i += 2) {
        const delimiter = filters[i - 1]
        const filter = filters[i]
        if (delimiter === ';') {
          orBlocks.push(andBlocks)
          andBlocks = []
        }
        andBlocks.push(filter)
      }
      if (andBlocks.length) orBlocks.push(andBlocks)

      const $or = orBlocks
        .map((and) => ({
          $and: and
            .map((filter) => {
              const matchResults = filter.match(matchParams)
              if (!matchResults) return []
              const [, field, rawParams] = matchResults
              const parsed = rawParams
                .split(',')
                .map((params) => params.split(':'))
                .map((params) => params.map((v) => v.trim()))
                .map((params) =>
                  params.length <= 1 ? ['match', params[0]] : params
                )
                .map((params) => {
                  // @ts-ignore
                  const operation: 'match' | 'contains' = params.shift()
                  if (!operation) return null
                  const operator = operations[operation]
                  // @ts-ignore
                  if (operator) return operator(field, ...params)
                  if (!allowedOperators.includes(operation)) return null
                  return {
                    [field]: {
                      [`$${operation}`]: params.length > 1 ? params : params[0],
                    },
                  }
                })

              return parsed.filter((v) => v !== null)
            })
            .reduce((acc, cur) => [...acc, ...cur], []),
        }))
        .filter((v) => v.$and.length)

      if (!$or.length) return this
      // @ts-ignore
      return this.find({ $or })
    },
    queryDataTable(
      this: Query,
      params: Partial<QueryOptions>
    ): Promise<PaginatedResult> {
      // Added for backwards compatibility
      return this.dataTable(params)
    },
    async dataTable(
      this: Query,
      params: Partial<QueryOptions>
    ): Promise<PaginatedResult> {
      const {
        itemsPerPage,
        search,
        sortBy,
        filter,
        getFilterList,
        page,
        searchOptions = {},
        sortDesc = '',
      } = params

      if (getFilterList) {
        const data = await this.dataTableGetFilterList(getFilterList)
        return {
          data,
          totalCount: data.length,
          resultCount: data.length,
        }
      }

      // eslint-disable-next-line @typescript-eslint/no-this-alias
      let cursor: Query | DocumentQuery<any, any, any> = this
      if (filter !== undefined) cursor = cursor.dataTableFilter(filter)
      if (search !== undefined)
        cursor = cursor.dataTableSearch(search, searchOptions)
      if (sortBy !== undefined) cursor = cursor.dataTableSort(sortBy, sortDesc)
      return cursor.dataTablePaginated(page, itemsPerPage)
    },
    async dataTableGetFilterList(
      this: Query,
      field: string
    ): Promise<QueryFilterResult[]> {
      return this.model.aggregate([
        {
          $project: {
            field: `$${field}`,
          },
        },
        { $unwind: '$field' },
        { $unwind: '$field' },
        { $unwind: '$field' },
        { $unwind: '$field' },
        { $unwind: '$field' },
        { $unwind: '$field' },
        {
          $group: {
            _id: '$field',
            count: { $sum: 1 },
          },
        },
        {
          $project: {
            _id: false,
            count: '$count',
            value: '$_id',
          },
        },
        {
          $sort: { value: 1 },
        },
      ])
    },
  }
  Object.assign(query, queryExtension)
}
