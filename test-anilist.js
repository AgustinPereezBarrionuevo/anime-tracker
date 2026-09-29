const query = `
  query ($search: String) {
    Page(perPage: 5) {
      media(search: $search, type: ANIME) {
        id
        title {
          romaji
        }
        episodes
        coverImage {
          large
        }
        description
      }
    }
  }
`;

const respuesta = await fetch('https://graphql.anilist.co', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    query: query,
    variables: { search: 'naruto' },
  }),
});

console.log('Status:', respuesta.status);
const data = await respuesta.json();
console.log(JSON.stringify(data, null, 2));