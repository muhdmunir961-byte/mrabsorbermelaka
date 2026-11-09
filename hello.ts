export default function hello(): Promise<Response> {
  return Promise.resolve(new Response('Hello from Neon Functions'));
}
