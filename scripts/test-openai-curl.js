"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", { value: true });
var cp = require("child_process");
var util = require("util");
var fs = require("fs");
var path = require("path");
var dotenv = require("dotenv");
dotenv.config();
var exec = util.promisify(cp.exec);
var API_KEY = "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";
var INPUT_IMAGE = 'input.png';
var OUTPUT_IMAGE = 'output_curl.png';
function testOpenAiCurl() {
    return __awaiter(this, void 0, void 0, function () {
        var tmpDir, inputPath, promptPath, prompt_1, curlCommand, _a, stdout, stderr, response, b64, e_1;
        var _b, _c;
        return __generator(this, function (_d) {
            switch (_d.label) {
                case 0:
                    if (!API_KEY) {
                        console.error('Error: OPENAI_API_KEY not found in .env');
                        return [2 /*return*/];
                    }
                    if (!fs.existsSync(INPUT_IMAGE)) {
                        console.error("Error: ".concat(INPUT_IMAGE, " not found. Please provide an input image."));
                        return [2 /*return*/];
                    }
                    console.log("Starting test with Direct CURL Mirror (gpt-image-1.5)");
                    tmpDir = path.join(process.cwd(), 'scripts', 'tmp');
                    if (!fs.existsSync(tmpDir))
                        fs.mkdirSync(tmpDir, { recursive: true });
                    inputPath = path.join(tmpDir, "input_".concat(Date.now(), ".png"));
                    promptPath = path.join(tmpDir, "prompt_".concat(Date.now(), ".txt"));
                    _d.label = 1;
                case 1:
                    _d.trys.push([1, 3, 4, 5]);
                    // 1. Prepare files
                    fs.copyFileSync(INPUT_IMAGE, inputPath);
                    prompt_1 = 'Keep the exact same face, same identity, same facial features. Do not modify the face. Change only the background to a tropical beach. Add realistic sunglasses.';
                    fs.writeFileSync(promptPath, prompt_1);
                    curlCommand = [
                        'curl -s -X POST https://api.openai.com/v1/images/edits',
                        "-H \"Authorization: Bearer ".concat(API_KEY, "\""),
                        '-F "model=gpt-image-1.5"',
                        "-F \"image=@".concat(inputPath, ";type=image/png\""),
                        '-F "input_fidelity=high"',
                        '-F "quality=high"',
                        "-F \"prompt=<".concat(promptPath, "\""),
                        '-F "size=1024x1536"',
                        '-F "response_format=b64_json"',
                    ].join(' ');
                    console.log("Executing CURL command...");
                    return [4 /*yield*/, exec(curlCommand, {
                            maxBuffer: 1024 * 1024 * 30,
                        })];
                case 2:
                    _a = _d.sent(), stdout = _a.stdout, stderr = _a.stderr;
                    if (stderr) {
                        console.warn("CURL Stderr: ".concat(stderr));
                    }
                    response = JSON.parse(stdout);
                    b64 = (_c = (_b = response.data) === null || _b === void 0 ? void 0 : _b[0]) === null || _c === void 0 ? void 0 : _c.b64_json;
                    if (!b64) {
                        console.error('CURL failed:', JSON.stringify(response, null, 2));
                        return [2 /*return*/];
                    }
                    fs.writeFileSync(OUTPUT_IMAGE, Buffer.from(b64, 'base64'));
                    console.log("SUCCESS! Output saved to ".concat(OUTPUT_IMAGE));
                    return [3 /*break*/, 5];
                case 3:
                    e_1 = _d.sent();
                    console.error("FAILED: ".concat(e_1.message));
                    return [3 /*break*/, 5];
                case 4:
                    // Cleanup
                    if (fs.existsSync(inputPath))
                        fs.unlinkSync(inputPath);
                    if (fs.existsSync(promptPath))
                        fs.unlinkSync(promptPath);
                    return [7 /*endfinally*/];
                case 5: return [2 /*return*/];
            }
        });
    });
}
testOpenAiCurl();
