const multer = require('multer');
const xlsx = require('xlsx');
const express = require('express');
const rateLimit = require('express-rate-limit');
const router = express.Router();
const productService = require('../services/productService');
const { authenticate } = require('../middleware/auth');
const { workerOrOwner } = require('../middleware/permissions');

const MAX_ROWS = 10000;
const ALLOWED_EXTENSIONS = ['.xls', '.xlsx'];
const ALLOWED_MIMES = [
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
];

const uploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many upload attempts. Please try again later.' }
});

function hasAllowedExcelExtension(filename = '') {
  const lower = String(filename).toLowerCase();
  return ALLOWED_EXTENSIONS.some((extension) => lower.endsWith(extension));
}

// Multer setup for file uploads
const storage = multer.memoryStorage();
const upload = multer({ 
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB max file size
  },
  fileFilter: (req, file, cb) => {
    // Only allow Excel files
    if (ALLOWED_MIMES.includes(file.mimetype) && hasAllowedExcelExtension(file.originalname)) {
      cb(null, true);
    } else {
      cb(new Error('Only Excel files (.xls, .xlsx) are allowed'));
    }
  }
});

// POST /api/products/upload-excel - Upload Excel file to bulk import products
router.post('/upload-excel', authenticate, workerOrOwner, uploadLimiter, upload.single('file'), async (req, res) => {
  try {
    const businessId = req.businessId;
    const workerId = req.workerId;
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No file uploaded' });
    }
    
    // Parse Excel file
    const workbook = xlsx.read(req.file.buffer, {
      type: 'buffer',
      dense: true,
      cellFormula: false,
      cellHTML: false
    });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    if (!sheetName || !sheet) {
      return res.status(400).json({ success: false, error: 'Excel file does not contain a readable worksheet' });
    }
    
    // Get all rows as arrays
    const allRowsArray = xlsx.utils.sheet_to_json(sheet, { header: 1, defval: null, raw: false });
    
    // Check row limit to prevent memory issues
    if (allRowsArray.length > MAX_ROWS) {
      return res.status(400).json({ 
        success: false, 
        error: `File exceeds maximum row limit. Maximum ${MAX_ROWS} rows allowed, found ${allRowsArray.length} rows.` 
      });
    }
    
    console.log('\n====== INTELLIGENT EXCEL ANALYSIS ======');
    console.log(`Total rows found: ${allRowsArray.length}`);
    
    // STEP 1: Find data region (skip title/header rows)
    let dataStartRow = 0;
    for (let i = 0; i < Math.min(30, allRowsArray.length); i++) {
      const row = allRowsArray[i];
      const nonEmptyCount = row.filter(c => c !== null && c !== undefined && String(c).trim() !== '').length;
      
      // Look for 3+ consecutive rows with 3+ filled cells (indicates data region)
      if (nonEmptyCount >= 3) {
        let consecutiveDataRows = 0;
        for (let j = i; j < Math.min(i + 5, allRowsArray.length); j++) {
          const testRow = allRowsArray[j];
          const testCount = testRow.filter(c => c !== null && c !== undefined && String(c).trim() !== '').length;
          if (testCount >= 3) consecutiveDataRows++;
        }
        if (consecutiveDataRows >= 3) {
          dataStartRow = i;
          console.log(`✓ Data region starts at row ${i + 1}`);
          break;
        }
      }
    }
    
    const dataRegion = allRowsArray.slice(dataStartRow);
    if (dataRegion.length < 2) {
      return res.status(400).json({ success: false, error: 'Not enough data rows found in Excel file' });
    }
    
    // STEP 2: Intelligent column analysis - detect what each column contains
    const maxCols = Math.max(...dataRegion.map(r => r.length));
    const columnAnalysis = [];
    
    for (let colIdx = 0; colIdx < maxCols; colIdx++) {
      const samples = dataRegion
        .slice(0, Math.min(50, dataRegion.length))
        .map(r => r[colIdx])
        .filter(c => c !== null && c !== undefined && String(c).trim() !== '');
      
      if (samples.length === 0) continue;
      
      const analysis = {
        index: colIdx,
        samples: samples.slice(0, 3),
        totalValues: samples.length,
        uniqueValues: new Set(samples).size,
        avgLength: samples.reduce((sum, s) => sum + String(s).length, 0) / samples.length,
        numericCount: 0,
        textCount: 0,
        isSequential: false,
        isPrice: false,
        isQuantity: false,
        isName: false,
        headerText: String(dataRegion[0][colIdx] || '').toLowerCase()
      };
      
      // Analyze each sample value
      samples.forEach(val => {
        const str = String(val).trim();
        const cleaned = str.replace(/[₵$¢£€,\s]/g, '');
        if (!isNaN(cleaned) && cleaned !== '') {
          analysis.numericCount++;
          const num = parseFloat(cleaned);
          // Price detection: numeric values, prefer those with currency symbols or decimals
          if (num > 0 && num < 10000) {
            if (str.match(/[₵$¢£€,.]/) || (num < 1000 && str.includes('.'))) {
              analysis.isPrice = true; // Strong price indicator
            } else if (num >= 1 && num < 1000) {
              analysis.isPrice = true; // Weaker indicator for reasonable price range
            }
          }
        } else {
          analysis.textCount++;
        }
      });
      
      // Detect sequential numbers (IDs, row numbers - skip these)
      if (analysis.numericCount > samples.length * 0.8) {
        const numbers = samples.map(s => parseFloat(String(s).replace(/[^\d.-]/g, ''))).filter(n => !isNaN(n));
        if (numbers.length > 2) {
          const diffs = [];
          for (let i = 1; i < Math.min(10, numbers.length); i++) {
            diffs.push(numbers[i] - numbers[i-1]);
          }
          const avgDiff = diffs.reduce((a,b) => a+b, 0) / diffs.length;
          if (Math.abs(avgDiff - 1) < 0.1) {
            analysis.isSequential = true;
          }
        }
        
        // Quantity: integers 0-10000
        const allIntegers = samples.every(s => {
          const num = parseFloat(String(s).replace(/[^\d.-]/g, ''));
          return !isNaN(num) && Math.floor(num) === num && num >= 0 && num < 10000;
        });
        if (allIntegers) analysis.isQuantity = true;
      }
      
      // Name: text, good length, high uniqueness
      if (analysis.textCount > samples.length * 0.6 && 
          analysis.avgLength > 5 && 
          analysis.uniqueValues > samples.length * 0.7) {
        analysis.isName = true;
      }
      
      columnAnalysis.push(analysis);
    }
    
    console.log('✓ Column types detected:', columnAnalysis.map(c => ({
      col: c.index,
      type: c.isName ? 'NAME' : c.isPrice ? 'PRICE' : c.isQuantity ? 'QTY' : c.isSequential ? 'ID' : 'OTHER',
      samples: c.samples
    })));
    
    // STEP 3: Smart mapping
    const mapping = { name: null, cost_price: null, selling_price: null, quantity: null };

    // Map NAME
    const nameColumns = columnAnalysis
      .filter(c => c.isName || (c.textCount > c.numericCount && c.avgLength > 5))
      .sort((a, b) => b.uniqueValues - a.uniqueValues);
    if (nameColumns.length > 0) mapping.name = nameColumns[0].index;

    // Map PRICES - simple approach: assign numeric columns in order
    const numericColumns = columnAnalysis
      .filter(c => c.numericCount > c.totalValues * 0.7 && !c.isSequential)
      .sort((a, b) => a.index - b.index); // Sort by column index
    
    // Assign in typical order: cost_price, selling_price, quantity
    if (numericColumns.length > 0) mapping.cost_price = numericColumns[0].index;
    if (numericColumns.length > 1) mapping.selling_price = numericColumns[1].index;
    if (numericColumns.length > 2) mapping.quantity = numericColumns[2].index;
    
    if (mapping.cost_price === null && mapping.selling_price === null) {
      const numericCols = columnAnalysis.filter(c => c.numericCount > c.totalValues * 0.7 && !c.isSequential);
      if (numericCols.length > 0) {
        mapping.selling_price = numericCols[0].index;
        if (numericCols.length > 1) mapping.cost_price = numericCols[1].index;
      }
    }
    
    if (mapping.selling_price === null) {
      return res.status(400).json({ 
        success: false, 
        error: 'Could not detect price columns. Ensure your Excel has numeric columns for prices.' 
      });
    }
    
    // STEP 5: Extract data
    const rawRows = dataRegion.slice(1)
      .map((row, idx) => ({
        rowNumber: dataStartRow + idx + 2,
        name: row[mapping.name],
        cost_price: row[mapping.cost_price],
        selling_price: row[mapping.selling_price],
        quantity: mapping.quantity !== null ? row[mapping.quantity] : undefined
      }));
    
    console.log(`✓ Extracted ${rawRows.length} data rows\n`);
    
    // Utility functions
    const toNumber = (val) => {
      if (val === undefined || val === null) return undefined;
      const str = String(val).trim();
      if (str === '' || str === '-' || str === 'N/A' || str === 'n/a' || str === '#') return undefined;
      const cleaned = str.replace(/[GH₵₵¢$€£¥₹]/gi, '').replace(/[,\s]/g, '').replace(/%/g, '');
      const parsed = Number(cleaned);
      return Number.isFinite(parsed) ? parsed : NaN;
    };

    const cleanText = (val) => {
      if (val === undefined || val === null) return undefined;
      const str = String(val).trim();
      if (str === '#' || str === 'No.' || str === 'ID' || str.length === 0) return undefined;
      return str.replace(/\s+/g, ' ');
    };

    // Process rows
    const results = [];
    for (let i = 0; i < rawRows.length; i++) {
      const row = rawRows[i];
      const rowNumber = row.rowNumber;

      const name = cleanText(row.name);
      const cost_price = toNumber(row.cost_price);
      const selling_price = toNumber(row.selling_price);
      const quantity = toNumber(row.quantity);

      // Skip empty rows
      if (!name && cost_price === undefined && selling_price === undefined) continue;

      if (!name) {
        results.push({ rowNumber, success: false, error: 'Invalid product name' });
        continue;
      }

      let finalCost = cost_price;
      let finalSelling = selling_price;
      
      if (finalSelling === undefined || Number.isNaN(finalSelling)) {
        results.push({ rowNumber, name, success: false, error: 'Invalid selling price' });
        continue;
      }
      
      // Auto-estimate cost if missing
      if (finalCost === undefined || Number.isNaN(finalCost)) {
        finalCost = finalSelling * 0.7;
      }

      if (quantity !== undefined && Number.isNaN(quantity)) {
        results.push({ rowNumber, name, success: false, error: 'Invalid quantity' });
        continue;
      }

      const result = await productService.createProduct(businessId, workerId, {
        name,
        cost_price: finalCost,
        selling_price: finalSelling,
        quantity: quantity !== undefined && !Number.isNaN(quantity) ? Math.round(quantity) : undefined,
        low_stock_alert: undefined
      });
      
      results.push({ rowNumber, name, ...result });
    }
    
    const failed = results.filter(r => !r.success).length;
    const inserted = results.length - failed;
    
    console.log(`====== IMPORT COMPLETE: ${inserted} inserted, ${failed} failed ======\n`);
    if (failed > 0) {
      console.log('Failed rows:', results.filter(r => !r.success).slice(0, 5));
    }
    
    res.status(200).json({ success: true, inserted, failed, results });
  } catch (error) {
    console.error('Excel upload error:', error);
    
    // Handle multer file size errors
    if (error instanceof multer.MulterError) {
      if (error.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ success: false, error: 'File size exceeds 10MB limit' });
      }
      return res.status(400).json({ success: false, error: `File upload error: ${error.message}` });
    }
    
    res.status(500).json({ success: false, error: 'Failed to process Excel file' });
  }
});

module.exports = router;
