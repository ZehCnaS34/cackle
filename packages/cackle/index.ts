class Package {
  path: string;
}

interface Awesome {
  name?: string;
}

function awesome(payload: Awesome) {
  if (payload.name != null)
    console.log(payload.name);
}


awesome({name: 'alex'});
