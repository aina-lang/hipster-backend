import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import * as FormData from 'form-data';
import * as dotenv from 'dotenv';

dotenv.config();

const API_KEY = process.env.OPENAI_API_KEY;
const INPUT_IMAGE = './input.png'; // Make sure this file exists in the current directory
const OUTPUT_IMAGE = 'output_test.png';

async function testOpenAiEdit() {
  if (!API_KEY) {
    console.error('Error: OPENAI_API_KEY not found in .env');
    return;
  }

  if (!fs.existsSync(INPUT_IMAGE)) {
    console.error(
      `Error: ${INPUT_IMAGE} not found. Please provide an input image.`,
    );
    return;
  }

  console.log(`Starting test with model: gpt-image-1.5`);
  console.log(`Input image: ${INPUT_IMAGE}`);

  try {
    const formData = new FormData();
    formData.append('model', 'gpt-image-1.5');
    formData.append('image', fs.createReadStream(INPUT_IMAGE));
    formData.append('input_fidelity', 'high');
    formData.append('quality', 'high');
    formData.append(
      'prompt',
      'Keep the exact same face, same identity, same facial features. Do not modify the face. Change only the background to a tropical beach. Add realistic sunglasses.',
    );
    formData.append('size', '1024x1536');
    formData.append('response_format', 'b64_json');

    console.log('Sending request to OpenAI...');

    const response = await axios.post(
      'https://api.openai.com/v1/images/edits',
      formData,
      {
        headers: {
          ...formData.getHeaders(),
          Authorization: `Bearer ${API_KEY}`,
        },
      },
    );

    const b64 = response.data.data?.[0]?.b64_json;
    if (!b64) {
      console.error('Error: No image data returned', response.data);
      return;
    }

    fs.writeFileSync(OUTPUT_IMAGE, Buffer.from(b64, 'base64'));
    console.log(`SUCCESS! Output saved to ${OUTPUT_IMAGE}`);
  } catch (error: any) {
    if (error.response) {
      console.error(
        'API FAILED:',
        JSON.stringify(error.response.data, null, 2),
      );
    } else {
      console.error('FAILED:', error.message);
    }
  }
}

testOpenAiEdit();
