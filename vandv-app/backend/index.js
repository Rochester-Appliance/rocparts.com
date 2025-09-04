const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();
const port = 3001;

app.use(cors());
app.use(express.json());

app.post('/api/get-parts-info', async (req, res) => {
  const { mfgCode, partNumber } = req.body;

  if (!mfgCode || !partNumber) {
    return res.status(400).json({ error: 'Missing mfgCode or partNumber' });
  }

  const requestData = {
    commonHeader: {
      user: 'M1945',
      password: '9dVxdym69mNs3G8',
    },
    mfgCode,
    partNumber,
  };

  const url = 'https://soapbeta.streamflow.ca/vandvapi/GetPartsInfo';

  try {
    const response = await axios.post(url, requestData);
    res.json(response.data);
  } catch (error) {
    res.status(error.response ? error.response.status : 500).json({
      error: 'Failed to get parts info',
      details: error.response ? error.response.data : 'An unknown error occurred',
    });
  }
});

app.post('/api/model-search', async (req, res) => {
  const { modelNumber } = req.body;

  if (!modelNumber) {
    return res.status(400).json({ error: 'Missing modelNumber' });
  }

  const requestData = {
    username: 'M1945',
    password: '9dVxdym69mNs3G8',
    modelNumber,
  };

  const url = 'https://soapbeta.streamflow.ca/iplvandv/model-search';

  try {
    const response = await axios.post(url, requestData);
    res.json(response.data);
  } catch (error) {
    res.status(error.response ? error.response.status : 500).json({
      error: 'Failed to search models',
      details: error.response ? error.response.data : 'An unknown error occurred',
    });
  }
});

app.post('/api/get-diagrams', async (req, res) => {
  const { modelNumber, modelId } = req.body;

  if (!modelNumber || !modelId) {
    return res.status(400).json({ error: 'Missing modelNumber or modelId' });
  }

  const requestData = {
    username: 'M1945',
    password: '9dVxdym69mNs3G8',
    modelNumber,
    modelId,
  };

  const url = 'https://soapbeta.streamflow.ca/iplvandv/get-diagrams';

  try {
    const response = await axios.post(url, requestData);
    res.json(response.data);
  } catch (error) {
    res.status(error.response ? error.response.status : 500).json({
      error: 'Failed to get diagrams',
      details: error.response ? error.response.data : 'An unknown error occurred',
    });
  }
});

app.post('/api/get-diagram-parts', async (req, res) => {
  const { modelNumber, modelId, diagramId } = req.body;

  if (!modelNumber || !modelId || !diagramId) {
    return res.status(400).json({ error: 'Missing modelNumber, modelId or diagramId' });
  }

  const requestData = {
    username: 'M1945',
    password: '9dVxdym69mNs3G8',
    modelNumber,
    modelId,
    diagramId,
  };

  const url = 'https://soapbeta.streamflow.ca/iplvandv/get-diagram-parts';

  try {
    const response = await axios.post(url, requestData);
    res.json(response.data);
  } catch (error) {
    res.status(error.response ? error.response.status : 500).json({
      error: 'Failed to get diagram parts',
      details: error.response ? error.response.data : 'An unknown error occurred',
    });
  }
});

app.listen(port, () => {
  console.log(`Server listening at http://localhost:${port}`);
});
