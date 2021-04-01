/**
 *  Copyright 2020 Google LLC
 *
 *  Licensed under the Apache License, Version 2.0 (the "License");
 *  you may not use this file except in compliance with the License.
 *  You may obtain a copy of the License at
 *
 *      https://www.apache.org/licenses/LICENSE-2.0
 *
 *  Unless required by applicable law or agreed to in writing, software
 *  distributed under the License is distributed on an "AS IS" BASIS,
 *  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *  See the License for the specific language governing permissions and
 *  limitations under the License.
 */

const fs = require('fs');
const path = require('path');
const use = require('@tensorflow-models/universal-sentence-encoder');
const papaparse = require('papaparse');

/**
 * Parses a CSV file for a bot and generates a JSON serialized model for
 * loading in the web app.
 * @param {string} botName the name of the bot whose model should be
 * generated ('maid', 'butler' or 'chef').
 */
async function generateBotModel(botName) {
  const model = await use.load();
  const file = fs.readFileSync(path.join(__dirname, `${botName}.csv`), {
    encoding: 'utf8',
  });
  
  const parsed = papaparse.parse(file, {
    header: true,
    delimiter: ',',
    comments: '#',
    skipEmptyLines: true,
  });
  const queryMap = {};
  // The CSV file must include a header row, with the following columns:
  //    Query, Response, States, NewState
  // States and NewState are optional, and define the state transitions
  // and state conditions governing dialog matches.
  for (const {Query, Response, States, NewState} of parsed.data) {
    // The special string {{any}} represents that the response can be
    // applied to any query (conditioned on State, if applicable). It
    // is serialized in the JSON as null
    const query = Query === '{{any}}' ?
      null :
      Query;
    const queryKeyPair = [query];
    if (States) {
      queryKeyPair.push(States);
    }
    // The serialized queryMap uses as its key a JSON-encoded array
    // consisting of the candidate query (or null) and the value of the
    // States column, if it exists. If the States column does not exist
    // the array has only one element (the query).
    const queryKey = JSON.stringify(queryKeyPair);
    queryMap[queryKey] = {
      Query: query,
      Response: Response,
      States,
      NewState,
    };
  }
  const embeddingMap = {};
  await Promise.all(Object.keys(queryMap).map(async (queryKey) => {
    const {Query} = queryMap[queryKey];
    if (Query !== null) {
      // precalculate and cache the embedding result
      const embedding = await model.embed([Query]);
      embeddingMap[queryKey] = embedding.arraySync()[0];
    }
  }));
  fs.writeFileSync(
    path.join(
      __dirname,
      'src',
      'assets',
      'models',
      `${botName}.model.json`
    ),
    JSON.stringify({
      queryMap,
      embeddingMap,
    })
  );
}

Promise.all(['maid', 'butler', 'chef'].map(
  (botName) => generateBotModel(botName)));
  