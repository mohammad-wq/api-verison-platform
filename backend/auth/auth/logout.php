<?php
require_once dirname(__DIR__, 2) . '/config.php';

requireAuth();

sendSuccess(null, 'Logged out successfully');
?>
