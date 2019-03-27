const show = (v: any, tag = "show") => {
  console.log(tag, JSON.stringify(v));
  return v;
};

export function camel(str: string) {
  return str.replace(/([a-zA-Z])\-([a-zA-Z])/g, function(_, ...strings) {
    const [a, b] = strings;
    return a + b.toUpperCase();
  });
}
