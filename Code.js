(function (root) {
  'use strict';

  const DEFAULT_SEASON_ID = 31;
  const CSV_RAW_BASE = 'https://raw.githubusercontent.com/Gari365/Sky-Season-Spirit-Simulator/main/data/';
  const SEASONS = [
    { id: 31, folder: '31_Pearl', name: 'Season of Pearl', start_date: '2026-10-16T00:00:00-07:00', end_date: '2026-12-31T23:59:59-08:00', totalDays: 76, passBonusCandles: 30 },
    { id: 30, folder: '30_DearVanGogh', name: 'Season of Dear Van Gogh', start_date: '2026-07-17T00:00:00-07:00', end_date: '2026-10-01T23:59:59-07:00', totalDays: 77, passBonusCandles: 30 },
    { id: 29, folder: '29_Carnival', name: 'Season of Carnival', start_date: '2026-04-17T00:00:00-07:00', end_date: '2026-07-02T23:59:59-07:00', totalDays: 77, passBonusCandles: 30 },
    { id: 28, folder: '28_Lightmending', name: 'Season of Lightmending', start_date: '2026-01-16T00:00:00-08:00', end_date: '2026-04-02T23:59:59-07:00', totalDays: 77, passBonusCandles: 30 },
    { id: 27, folder: '27_Migration', name: 'Season of Migration', start_date: '2024-10-20T00:00:00-07:00', end_date: '2025-01-04T23:59:59-08:00', totalDays: 77, passBonusCandles: 30 }
  ];

  function getSeasonSlug(season) {
    return season.folder.toLowerCase();
  }

  function getSeason(seasonReference) {
    const requested = String(seasonReference ?? '')
      .trim()
      .replace(/^\/+|\/+$/g, '')
      .toLowerCase()
      .split('/')
      .pop();
    return SEASONS.find(season =>
      String(season.id) === requested
      || season.folder.toLowerCase() === requested
      || getSeasonSlug(season) === requested
    ) || SEASONS.find(season => season.id === DEFAULT_SEASON_ID);
  }

  function getSeasonRouteFromLocation(pathname) {
    const path = pathname || (root.location && root.location.pathname) || '';
    const lastSegment = decodeURIComponent(path.split('/').filter(Boolean).pop() || '').toLowerCase();
    return /^\d+_[a-z0-9]+$/.test(lastSegment) ? lastSegment : null;
  }

  function parseBoolean(value) {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value === 1;
    const normalized = String(value ?? '').trim().toLowerCase();
    return normalized === 'true' || normalized === '1' || normalized === 'yes';
  }

  function parseCsvRows(csvText) {
    const text = String(csvText || '').replace(/^\uFEFF/, '');
    const rows = [];
    let row = [];
    let field = '';
    let insideQuotes = false;

    for (let index = 0; index < text.length; index++) {
      const character = text[index];
      if (character === '"') {
        if (insideQuotes && text[index + 1] === '"') {
          field += '"';
          index++;
        } else {
          insideQuotes = !insideQuotes;
        }
      } else if (character === ',' && !insideQuotes) {
        row.push(field);
        field = '';
      } else if ((character === '\n' || character === '\r') && !insideQuotes) {
        if (character === '\r' && text[index + 1] === '\n') index++;
        row.push(field);
        if (row.some(value => value !== '')) rows.push(row);
        row = [];
        field = '';
      } else {
        field += character;
      }
    }

    if (field !== '' || row.length > 0) {
      row.push(field);
      if (row.some(value => value !== '')) rows.push(row);
    }
    if (insideQuotes) throw new Error('The season CSV contains an unterminated quoted field.');
    if (!rows.length) throw new Error('The season CSV is empty.');
    return rows;
  }

  function parseCsvData(csvText, targetSeasonId) {
    const rows = parseCsvRows(csvText);
    const headers = rows[0].map(header => String(header).trim().toLowerCase());
    const findCol = (...names) => names.map(name => headers.indexOf(name.toLowerCase())).find(index => index !== -1) ?? -1;
    const indexes = {
      seasonId: findCol('season_id', 'season id'),
      spiritId: findCol('spirit_id', 'spirit', 'spirit id'),
      spiritName: findCol('spirit_name', 'spirit name'),
      itemId: findCol('item_id', 'item id'),
      tier: findCol('tier'),
      nodeIndex: findCol('node_index', 'node index'),
      itemType: findCol('item_type', 'item type'),
      itemName: findCol('item_name', 'item name'),
      price: findCol('price'),
      currency: findCol('currency'),
      points: findCol('points'),
      pass: findCol('is_pass_exclusive', 'season pass', 'pass exclusive')
    };
    const valueAt = (row, index, fallback = '') => index === -1 ? fallback : String(row[index] ?? '').trim();
    const numberAt = (row, index, fallback) => {
      if (index === -1 || valueAt(row, index) === '') return fallback;
      const value = Number(valueAt(row, index));
      return Number.isFinite(value) ? value : fallback;
    };
    const defaultCurrencies = {
      'Season Candle': 's_candle',
      'Season Heart': 's_heart',
      'White Candle': 'candle',
      Candle: 'candle',
      Heart: 'heart'
    };
    const items = [];
    let backgroundUrl = null;

    rows.slice(1).forEach((row, rowIndex) => {
      const rowSeasonId = numberAt(row, indexes.seasonId, 0);
      if (rowSeasonId && rowSeasonId !== targetSeasonId) return;

      const itemType = valueAt(row, indexes.itemType, 'Item') || 'Item';
      const itemName = valueAt(row, indexes.itemName);
      if (itemType.toLowerCase() === 'background') {
        const isHttpsUrl = /^https:\/\/\S+$/i.test(itemName);
        const isAssetName = /^[a-z0-9 _.-]+$/i.test(itemName) && !itemName.includes('..');
        backgroundUrl = isHttpsUrl || isAssetName ? itemName : null;
        return;
      }

      const price = numberAt(row, indexes.price, 0);
      const rawCurrency = valueAt(row, indexes.currency);
      items.push({
        item_id: valueAt(row, indexes.itemId, `ITEM_${rowIndex + 2}`) || `ITEM_${rowIndex + 2}`,
        season_id: targetSeasonId,
        spirit_id: valueAt(row, indexes.spiritId, 'A') || 'A',
        spirit_name: valueAt(row, indexes.spiritName, 'Unknown Spirit') || 'Unknown Spirit',
        tier: numberAt(row, indexes.tier, 0),
        node_index: numberAt(row, indexes.nodeIndex, 1),
        item_type: itemType,
        item_name: itemName,
        price,
        currency: rawCurrency.toLowerCase() === 'tba'
          ? 'tba'
          : (price === 0 ? 'free' : (rawCurrency || defaultCurrencies[itemType] || 's_candle')),
        points: numberAt(row, indexes.points, 0),
        is_pass_exclusive: parseBoolean(valueAt(row, indexes.pass))
      });
    });

    return { items, backgroundUrl };
  }

  async function getSimulatorData(seasonReference) {
    const season = getSeason(seasonReference);
    const csvUrl = `${CSV_RAW_BASE}${season.folder}/${season.folder}.csv`;
    const response = await root.fetch(csvUrl, { cache: 'no-store' });
    if (!response.ok) {
      throw new Error(`Unable to load season CSV (${response.status}): ${csvUrl}`);
    }
    const seasonData = parseCsvData(await response.text(), season.id);
    return {
      season,
      seasons: SEASONS,
      items: seasonData.items,
      backgroundUrl: seasonData.backgroundUrl
    };
  }

  root.SkyPlannerBackend = Object.freeze({
    getSeason,
    getSeasonRouteFromLocation,
    getSeasonSlug,
    getSimulatorData,
    parseCsvData
  });
})(typeof window !== 'undefined' ? window : globalThis);
