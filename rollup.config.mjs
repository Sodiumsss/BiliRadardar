import fs from 'fs';

const banner = fs.readFileSync('./src/banner.js', 'utf-8').trim() + '\n\n';

export default {
    input: 'src/index.js',
    output: [
        {
            file: 'script.js',
            format: 'iife',
            banner: banner
        },
        {
            file: 'dist/script.user.js',
            format: 'iife',
            banner: banner
        }
    ]
};
