const respuesta = await fetch('https://api.jikan.moe/v4/anime?q=naruto');
console.log('Status:', respuesta.status);
const data = await respuesta.json();
console.log('Cantidad de resultados:', data.data?.length);