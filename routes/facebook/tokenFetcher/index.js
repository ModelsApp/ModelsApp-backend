const newDataFetcher = (api, access_token) => async (endpoint, params) => {
  return api.get(endpoint, {
    params: {
      ...params,
      access_token,
    },
    // axios escapes special characters, so it requires custom implemenation
    paramsSerializer: (params) => {
      const filteredParams = Object.entries(params)
        .filter(([key, value]) => key !== 'access_token')
        .reduce((acc, [key, value]) => ({ ...acc, [key]: value }), {});
      let serializedParams = Object.entries(filteredParams).map(([key, value]) => `${key}=${value}`);
      serializedParams = serializedParams.join('&');
      if (serializedParams.length) {
        serializedParams = `&${serializedParams}`;
      }

      return `access_token=${access_token}${serializedParams}`;
    }
  });
};

module.exports = newDataFetcher;
