const XLSX = require('xlsx');
const PRODUCTS_SHEET_NAME = 'Продукти';
const ENUMS_SHEET_NAME    = 'Категорії';
const NOTES_SHEET_NAME    = 'Пояснення';
const FORMULA_SHEET_NAME  = 'НБУ';

const filterRows = (rows) => {
  let stopReading = false;
  return rows.filter((row) => {
    if (stopReading) return false;

    // Check if all cells in the row are empty
    const allCellsEmpty = row.every(cell => !cell);

    if (allCellsEmpty) {
      stopReading = true;
      return false;
    }
    return true;
  });
};

const readProductHeaders = (productsData) => {
  // Headers (1st, 2nd)
  const rawHeaders = productsData.slice(0, 2);
  let headers = [[], []];
  let prev = null;
  for (const i in rawHeaders[0]) {
    const index = parseInt(i);
    headers[0][i] = rawHeaders[0][i];
    if (prev !== null && index > prev + 1) {
      for (let k = 1; k <= index - prev; k++) headers[0][k + prev] = headers[0][prev];
    }
    prev = index;
  }
  for (let i = rawHeaders[0].length; i < rawHeaders[1].length; i++) {
    headers[0][i] = headers[0][prev];
  }
  const variables = productsData.slice(1, 2)[0];
  for (let i = 0; i < rawHeaders[1].length; i++) {
    headers[1][i] = rawHeaders[1][i] || '';
  }
  // titles in headers[0];
  // variables in headers[1];

  let cols = [];
  for (const i in variables) {
    cols.push({
      column: parseInt(i),
      title: headers[0][i],
      variable: variables[i]
    });
  }
  return { cols, rawHeaders, headers, variables };
};

const setNestedProperty = (obj, path, value) => {
  const keys = path.split('.');
  let current = obj;

  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i];
    if (!current[key]) {
      current[key] = {};
    }
    current = current[key];
  }

  current[keys[keys.length - 1]] = value;
};

const fillWith = (obj, name, defaults, prev) => {
  for (const i in defaults) {
    const key = defaults[i];
    const keys = key.split('.');
    if (name !== keys[0]) continue;

    let current = obj;
    let p = prev;

    keys.shift();
    for (let i = 0; i < keys.length - 1; i++) {
      const k = keys[i];
      if (!current[k]) current[k] = {};
      if (p) p = p[k];
      current = current[k];
    }

    const lastKey = keys[keys.length - 1];
    if (current[lastKey] === undefined) {
      current[lastKey] = p ? p[lastKey] : null; // Set to null or any prev value if passed.
    }
  }
  return obj;
};

const excelDate = (serial) => {
  const utc_days = Math.floor(serial - 25569);
  const utc_value = utc_days * 86400;
  const date_info = new Date(utc_value * 1000);

  return date_info;
};

const decodeSheet = (enumerationsSheet, sheetName) => {
  const headerLength = 2;
  const errors = [];
  const enums = {};
  // Assuming enumerationsData is an array of arrays, directly from the sheet, not JSON-converted
  const enumerationsData = XLSX.utils.sheet_to_json(enumerationsSheet, { header: 1, raw: false, defval: null });

  if (enumerationsData.length < headerLength) {
    errors.push(`No header data (${headerLength} fixed rows) in the enumeration sheet: ${sheetName}`);
    return { enums, errors }; // Early return if header is insufficient
  }

  const columnMapping = {}; // Maps column names to their indexes
  enumerationsData[1].forEach((name, index) => {
    if (!name) return;
    if (name.includes('.')) {
      const [propName, subKey] = name.split('.');
      columnMapping[propName] = columnMapping[propName] || {};
      columnMapping[propName][subKey] = index;
    } else {
      columnMapping[name] = index;
    }
  });

  const enumerationsRows = enumerationsData.slice(headerLength);
  enumerationsRows.forEach((row, rowIndex) => {
    for (const [propName, value] of Object.entries(columnMapping)) {
      if (typeof value === 'object') {
        // Handle sub-properties
        for (const [subKey, colIndex] of Object.entries(value)) {
          const idColumnIndex = columnMapping[propName]; // Assuming ID is mapped directly to propName
          if (row.length > colIndex && row[colIndex] !== undefined) {
            const cellValue = row[colIndex];
            const id = row[idColumnIndex];
            enums[propName] = enums[propName] || {};
            enums[propName][id] = enums[propName][id] || {};
            enums[propName][id][subKey] = cellValue;
            // Additional handling for cell styles, HTML content, etc., goes here
          }
        }
      } else {
        // Handle ID or direct property
        const cellValue = row[value];
        if (cellValue !== undefined) {
          enums[propName] = enums[propName] || {};
          enums[propName][cellValue] = {};
          // Additional handling for direct properties without sub-keys
        }
      }
    }
  });

  return { enums, errors };
};

function readXLSXFile(file = 'output.xlsx') {
  const workbook = XLSX.readFile(file);

  // 1. Read all defined named ranges
  const definedNames = workbook.Workbook.Names;
  // console.log('Defined Named Ranges:', definedNames);

  // 2. Read all sheets
  // const sheetNames = workbook.SheetNames;

  // 3. Read 'Products' sheet
  const productsSheet = workbook.Sheets[PRODUCTS_SHEET_NAME];
  const productsData = XLSX.utils.sheet_to_json(productsSheet, { header: 1 });

  const { cols, variables } = readProductHeaders(productsData);

  cols.findName = function (index) {
    for (let i = 0; i < this.length; i++) {
      if (this[i].column === index) return this[i].variable;
    }
    return null;
  }

  function applyValue(value, r, c) {
    const address = XLSX.utils.encode_cell({ r, c });
    const cell = productsSheet[address];
    if (!cell) return 'undefined';

    switch (cell.t) {
      case 'n': // Number or Date
        if (cell.w && /\d{4}-\d{2}-\d{2}/.test(cell.w)) { // Check if formatted as a date
          return excelDate(value); // Convert to JavaScript Date
        }
        return parseFloat(value);
      case 's': // String
        return String(value);
      case 'b': // Boolean
        return Boolean(value);
      case 'e': // Error
        return new Error(value);
      case 'd': // Date
        return new Date(value);
      case 'z': // Stub cell
        return null;
      default:
        return 'undefined';
    }
  }

  const rowOffset = 2;
  // Data (from 2rd row)
  const productRows = filterRows(productsData.slice(rowOffset));

  let errors = [];
  let products = [];
  let product = null;
  productRows.forEach((row, index) => {
    let productRow = null;
    for (const columnIndex in row) {
      const j = parseInt(columnIndex);
      const name = cols.findName(j);
      if (null === name) continue;
      if (/^product\.id$/.test(name)) {
        if (!row[j]) {
          throw new Error(`product.id is undefined (column ${j})`);
        }
        if (null !== product) products.push(fillWith(product, 'product', variables));
        product = { rows: [] };
        productRow = null;
        product.id = applyValue(row[j], index + rowOffset, j);
      } else if (/^product\.(.+)$/.test(name)) {
        const words = name.split('.');
        words.shift();
        const path = words.join('.');
        setNestedProperty(product, path, applyValue(row[j], index + rowOffset, j));
      } else if (/^row\.(.+)$/.test(name)) {
        if (undefined === row[j]) continue;
        const words = name.split('.');
        words.shift();
        const path = words.join('.');
        if (null === productRow) productRow = {};
        setNestedProperty(productRow, path, applyValue(row[j], index + rowOffset, j));
      }
    }
    if (null === productRow) return;
    product.rows.push(fillWith(productRow, 'row', variables));
  });
  if (product) products.push(fillWith(product, 'product', variables));

  // 4. Read 'enumerations' and 'notes' sheets
  let { enums, errors: enumErrors } = decodeSheet(workbook.Sheets[ENUMS_SHEET_NAME], ENUMS_SHEET_NAME);
  errors = [...errors, ...enumErrors];

  let { enums: notes, errors: noteErrors } = decodeSheet(workbook.Sheets[NOTES_SHEET_NAME], NOTES_SHEET_NAME);
  errors = [...errors, ...noteErrors];

  return { products, enums, notes, errors };
}

module.exports = {
  readProducts: readXLSXFile
};
