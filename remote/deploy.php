<?php
require_once 'config.php';

function json_dump($data, $withHeader = false) {
    if ($withHeader) {
        header('Content-Type: application/json');
    }
    echo json_encode($data);
}

function listFiles($dir, $ignorePatterns = [], $baseDir = null) {
    if (null === $baseDir) {
        $baseDir = $dir;
    }
    $files = [];
    $items = scandir($dir);

    foreach ($items as $item) {
        if ($item === '.' || $item === '..') {
            continue;
        }
        $shouldIgnore = false;
        foreach ($ignorePatterns as $pattern) {
            if (preg_match($pattern, $item)) {
                $shouldIgnore = true;
                break;
            }
        }
        if ($shouldIgnore) {
            continue;
        }

        $fullPath = $dir . DIRECTORY_SEPARATOR . $item;

        if (is_dir($fullPath)) {
            $files = array_merge($files, listFiles($fullPath, $ignorePatterns, $baseDir));
        } elseif (is_file($fullPath)) {
            $files[] = substr($fullPath, strlen($baseDir) + 1);
        }
    }

    return $files;
}

function handleGetRequest() {
    if (!validate_authorization()) {
        http_response_code(401); // Unauthorized
        return;
    }
    $file = __DIR__ . '/version.json';
    if (file_exists($file)) {
        json_dump(json_decode(file_get_contents($file)));
    } else {
        json_dump(['version' => null]);
    }
}

function handlePostRequest() {
    if (!validate_authorization()) {
        http_response_code(401); // Unauthorized
        return;
    }

    $postData = json_decode(file_get_contents('php://input'), true);
    if (!isset($postData['files'])) {
        http_response_code(400);
        json_dump($postData, true);
        return;
    }
    $filesToUpdate = [];
    $filesToRemove = [];
    $ignoreFiles = [
        '/^\./',
        '/\.php$/'
    ];

    foreach ($postData['files'] as $file) {
        $filePath = $_SERVER['DOCUMENT_ROOT'] . '/' . ltrim($file['file'], '/');
        $exists = file_exists($filePath);
        $info = (object) [
            'size' => $exists ? filesize($filePath) : null,
            'time' => $exists ? filemtime($filePath) : null,
        ];
        $filesToUpdate[$file['file']] = $info;
    }

    // Check for files to remove
    $allFiles = listFiles($_SERVER['DOCUMENT_ROOT'], $ignoreFiles);
    foreach ($allFiles as $file) {
        // Check if file needs to be removed
        if (!array_key_exists($file, $filesToUpdate)) {
            $filesToRemove[$file] = true;
        }
    }

    json_dump(['filesToUpdate' => $filesToUpdate, 'filesToRemove' => $filesToRemove], true);
}

class File {
    public string $file;
    public int $size;
    public int $mtime;
    public string $err;
}
class Archive extends File {
    public int $no;
    public array $files = [];
    public static function create(Status $status, $rawData) {
        $no             = $status->getArchiveNo();
        $zipFile        = rtrim(NANO_DIR, '/') . "/dist_{$status->id}_{$no}.zip";
        $dir = dirname($zipFile);
        if (!is_dir($dir)) {
            mkdir($dir, 0755, true);
        }
        $rawData        = file_get_contents('php://input');
        $archive        = new self();
        $archive->no    = $no;
        $archive->file  = $zipFile;
        $archive->size  = file_put_contents($zipFile, $rawData);
        $archive->mtime = filemtime($zipFile);
        return $archive;
    }
    public function unpack($keepAfterUnpacking = false) {
        $this->files = [];
        $zip = new ZipArchive();
        if ($zip->open($this->file) === TRUE) {
            for ($i = 0; $i < $zip->numFiles; $i++) {
                $filename = $zip->getNameIndex($i);
                $fileFullPath = $_SERVER['DOCUMENT_ROOT'] . '/' . $filename;
                $fileInfo = new File();
                $fileInfo->file = $filename;
                set_error_handler(function($severity, $message, $file, $line) use (&$fileInfo) {
                    $fileInfo->err = $message;
                });
                $fileInfo->size = @filesize($fileFullPath);
                $fileInfo->mtime = @filemtime($fileFullPath);
                restore_error_handler();
                $this->files[] = $fileInfo;
            }
            $zip->extractTo($_SERVER['DOCUMENT_ROOT']);
            $zip->close();
            // Remove the zip file after extraction
            if (!$keepAfterUnpacking) {
                unlink($this->file);
            }
        }
        return $this->files;
    }
}
class Status {
    const CLASS_KEY = '_';
    public string $id;
    public string $ip;
    public int $chunks = 0;
    public array $uploaded = [];
    public array $removed =[];
    public array $files = [];
    private array $fileMap = [];
    public array $archives = [];
    private static function file($id, $subdir = '') {
        if ($subdir) {
            return NANO_DIR . DIRECTORY_SEPARATOR . $subdir . DIRECTORY_SEPARATOR . $id . '.json';
        }
        return NANO_DIR . DIRECTORY_SEPARATOR . $id . '.json';
    }
    public static function load($id) {
        $file = static::file($id);
        if (file_exists($file)) {
            $data = json_decode(file_get_contents($file));
            // Convert stdClass objects to their respective class instances
            array_walk_recursive($data, function (&$item, $key, $classKey) {
                if (is_object($item) && isset($item->{$classKey})) {
                    $className = $item->{$classKey};
                    $newObject = new $className();
                    foreach ($item as $prop => $val) {
                        if ($prop !== $classKey) {
                            $newObject->$prop = $val;
                        }
                    }
                    $item = $newObject;
                }
            }, static::CLASS_KEY);
            $status = new self();
            foreach ($data as $key => $value) {
                if (property_exists($status, $key)) {
                    $status->$key = $value;
                }
            }
            return $status;
        }
        $status = new self();
        $status->id = $id;
        $status->ip = static::getClientIp();
        return $status;
    }
    public static function getClientIp() {
        // Check for shared internet/ISP proxy
        if (!empty($_SERVER['HTTP_CLIENT_IP'])) {
            return $_SERVER['HTTP_CLIENT_IP'];
        }
        // Check if behind a proxy
        if (!empty($_SERVER['HTTP_X_FORWARDED_FOR'])) {
            // Can contain multiple IPs separated by comma
            $ips = explode(',', $_SERVER['HTTP_X_FORWARDED_FOR']);
            return trim($ips[0]); // Consider the first IP in the list as the client IP
        }
        // Default to REMOTE_ADDR if other headers are not set
        return $_SERVER['REMOTE_ADDR'];
    }
    public function save($subdir = '') {
        $file = static::file($this->id, $subdir);
        $dir = dirname($file);
        if (!is_dir($dir)) {
            mkdir($dir, 0755, true);
        }
        $data = clone $this;
        // Convert objects to arrays including their class names
        array_walk_recursive($data, function (&$item, $key, $classKey) {
            if (is_object($item)) {
                $className = get_class($item);
                $item = array_merge([$classKey => $className], get_object_vars($item));
            }
        }, static::CLASS_KEY);
        return file_put_contents($file, json_encode($data));
    }
    public function remove() {
        $file = static::file($this->id);
        if (file_exists($file)) {
            unlink($file);
            return true;
        }
        return false;
    }
    public function delete() {
        $file = static::file($this->id);
        if (file_exists($file)) {
            unlink($file);
            return true;
        }
        return false;
    }
    public function isReady() {
        return count($this->archives) === $this->chunks;
    }
    public function getArchiveNo() {
        return count($this->archives) + 1;
    }
    public function addArchive(Archive $archive) {
        $this->archives[] = $archive;
        foreach ($archive->files as $file) {
            $this->fileMap[$file->file] = $file;
        }
        return $this;
    }
    private function getFileFromArchives($file) {
        return $this->fileMap[$file] ?? null;
    }
    public function reload() {
        return self::load($this->id);
    }
    public function collect() {
        $this->files = [];
        $this->collectFiles($_SERVER['DOCUMENT_ROOT']);
        return $this;
    }
    private function collectFiles($directory) {
        $files = scandir($directory);
    
        foreach ($files as $file) {
            if ($file === '.' || $file === '..' || $file === '.nw') {
                continue;
            }
    
            $filePath = $directory . DIRECTORY_SEPARATOR . $file;
            if (is_file($filePath)) {
                $fileInfo = $this->getFileFromArchives($file);
                if (!$fileInfo) {
                    $fileInfo = new File();
                    $fileInfo->file = $file;
                    $fileInfo->size = filesize($filePath);
                    $fileInfo->mtime = filemtime($filePath);
                }
                $this->files[] = $fileInfo;
            } elseif (is_dir($filePath)) {
                $this->collectFiles($filePath); // Recursively scan subdirectory
            }
        }
    }
    public function commit() {
    }
    public function removeFiles(array $files) {
        $this->removed = [];
        foreach ($files as $file) {
            $fileToRemove = $_SERVER['DOCUMENT_ROOT'] . '/' . ltrim($file, '/');
            if (file_exists($fileToRemove)) {
                unlink($fileToRemove);
            }
            $isRemoved = file_exists($fileToRemove);
            $this->removed[] = [$fileToRemove, $isRemoved ];
        }
        return $this;
    }
}

/**
 * @param $id The publisher session id (unique per each session).
 * @outputs object Status
 */
function handlePutRequest() {
    if (!validate_authorization()) {
        http_response_code(401); // Unauthorized
        return;
    }

    // load current status of uploaded files in this session.
    $status = Status::load($_GET['id']);
    if (isset($_GET['chunks'])) {
        $status->chunks = $_GET['chunks'];
    }
    $archive = Archive::create($status, file_get_contents('php://input'));
    $status->addArchive($archive)->save();
    $archive->unpack();
    // files are updated in archive, and so in status by the reference, so let's save it.
    // but reload first, so during the unpacking other process could save new date.
    $status = $status->reload();
    $status->save();
    $code = 200;
    if ($status->isReady()) {
        // collect the information about current version of project files
        $files = isset($_POST['filesToRemove']) ? json_decode($_POST['filesToRemove'], true) : [];
        $status->removeFiles($files)->save();
        $status->collect();
        $code = 201;
    }
    // move status to completed
    $status->save('completed');
    $status->remove();

    http_response_code($code);
    json_dump($status, true);
}

function handleDeleteRequest() {
    if (!validate_authorization()) {
        http_response_code(401); // Unauthorized
        return;
    }
    if (!isset($_GET['file'])) {

    }
    if (!isset($_GET['file'])) {
        http_response_code(400);
        json_dump('File is not provided', true);
        return;
    }
    $fileToRemove = null;
    $ignoreFiles = [
        '/^\./',
        '/\.php$/'
    ];

    $file = $_GET['file'];
    $shouldIgnore = false;
    foreach ($ignoreFiles as $pattern) {
        if (preg_match($pattern, $file)) {
            $shouldIgnore = true;
            break;
        }
    }
    $removed = false;
    if (!$shouldIgnore) {
        $filePath = rtrim($_SERVER['DOCUMENT_ROOT'], '/') . '/' . ltrim($file, '/');
        $fileToRemove = $filePath;
        @unlink($filePath);
        $removed = !file_exists($filePath);
    }

    json_dump(['fileRemoved' => $fileToRemove, 'removed' => $removed], true);
}

function validate_authorization()
{
    $headers = apache_request_headers();
    $authHeader = $headers['Authorization'] ?? ($_SERVER['HTTP_AUTHORIZATION'] ?? '');
    if (strpos($authHeader, 'Bearer ') === 0) {
        return substr($authHeader, 7) === AUTH_KEY;
    }
    return false;
}

if ('cli' === php_sapi_name()) {
    $ignoreFiles = [
        '/^\./',
        '/\.php$/'
    ];

    // Check for files to remove
    $allFiles = listFiles(__DIR__, $ignoreFiles);
    foreach ($allFiles as $file) {
        printf("%s\n", $file);
    }
} else {
    switch ($_SERVER['REQUEST_METHOD']) {
        case 'GET':
            handleGetRequest();
            break;
        case 'POST':
            handlePostRequest();
            break;
        case 'PUT':
            handlePutRequest();
            break;
        case 'DELETE':
            handleDeleteRequest();
            break;
    
        default:
            http_response_code(405); // Method Not Allowed
            break;
    }
}
