function minifyScripts(args, mods) {
    const { data, file, filesIndex, filesLen, key, out, meta } = args;
    if (mods['html']?.['cached']) return args;
    // logic here
    return args;
}

module.exports = minifyScripts;